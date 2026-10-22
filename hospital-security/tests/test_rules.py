"""Endpoint (ransomware) and hospital behaviour rules, exercised with synthetic events only."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services import settings_service
from app.services.rules.endpoint import EndpointMonitor, parse_sysmon
from app.services.rules.hospital import AuthEvent, AuthMonitor, evaluate_flow_policy

RULES = settings_service.defaults()["rules"]
T0 = datetime(2026, 10, 22, 14, 0, tzinfo=UTC)


def proc(cmd: str, image: str = r"C:\Windows\System32\cmd.exe", parent: str = r"C:\Windows\explorer.exe", rid: int = 1):
    return parse_sysmon({"EventID": 1, "UtcTime": "2026-10-22 14:00:00.000", "Computer": "WARD4-PC07",
                         "User": "HOSP\\nurse1", "Image": image, "CommandLine": cmd, "ParentImage": parent,
                         "EventRecordID": rid})


class TestEndpointRules:
    def test_shadow_copy_deletion_is_critical(self):
        out = EndpointMonitor().evaluate(proc("vssadmin.exe Delete Shadows /All /Quiet"), RULES)
        assert [(d.detector, d.severity, d.mitre_technique) for d in out] == [("rule.ep.shadow_copy_delete", "critical", "T1490")]
        assert out[0].evidence["command_line"].startswith("vssadmin") and out[0].host == "ward4-pc07"

    def test_wmic_bcdedit_wbadmin_wevtutil(self):
        m = EndpointMonitor()
        cmds = {"wmic shadowcopy delete": "rule.ep.shadow_copy_delete",
                "bcdedit /set {default} recoveryenabled No": "rule.ep.recovery_disabled",
                "wbadmin delete catalog -quiet": "rule.ep.backup_catalog_delete",
                "wevtutil cl Security": "rule.ep.event_log_cleared",
                "powershell Set-MpPreference -DisableRealtimeMonitoring $true": "rule.ep.defender_tamper"}
        for cmd, rule in cmds.items():
            assert rule in [d.detector for d in m.evaluate(proc(cmd), RULES)], cmd

    def test_office_spawning_powershell(self):
        out = EndpointMonitor().evaluate(proc("powershell -nop -w hidden", image=r"C:\...\powershell.exe",
                                              parent=r"C:\Program Files\Microsoft Office\WINWORD.EXE"), RULES)
        assert "rule.ep.office_spawns_shell" in [d.detector for d in out]

    def test_benign_admin_commands_do_not_alert(self):
        m = EndpointMonitor()
        for cmd in ("vssadmin list shadows", "ipconfig /all", "wevtutil qe System /c:5", "bcdedit /enum"):
            assert m.evaluate(proc(cmd), RULES) == [], cmd

    def test_mass_encryption_with_ransom_extension(self):
        m = EndpointMonitor()
        rules = {**RULES, "mass_file_threshold": 50, "mass_file_window_seconds": 60}
        out = []
        for i in range(60):
            ev = parse_sysmon({"EventID": 11, "UtcTime": f"2026-10-22 14:00:{i % 60:02d}.000", "Computer": "PACS-01",
                               "Image": r"C:\Users\Public\svc.exe", "ProcessGuid": "{abc}",
                               "TargetFilename": rf"D:\imaging\study{i}.dcm.lockbit", "EventRecordID": 100 + i})
            out += m.evaluate(ev, rules)
        assert out and out[-1].category == "ransomware_activity" and out[-1].severity == "critical"
        assert out[-1].evidence["ransom_extension_hits"] >= 50

    def test_mass_file_activity_without_ransom_signals_is_medium(self):
        m = EndpointMonitor()
        rules = {**RULES, "mass_file_threshold": 20}
        out = []
        for i in range(25):
            ext = ["docx", "pdf", "xlsx", "png", "txt"][i % 5]
            ev = parse_sysmon({"EventID": 11, "UtcTime": "2026-10-22 14:00:01.000", "Computer": "FS-02",
                               "Image": r"C:\Program Files\Backup\agent.exe", "TargetFilename": rf"E:\b\f{i}.{ext}"})
            out += m.evaluate(ev, rules)
        assert out[-1].category == "mass_file_modification" and out[-1].severity == "medium"

    def test_ransom_note(self):
        ev = parse_sysmon({"EventID": 11, "UtcTime": "2026-10-22 14:00:01.000", "Computer": "HR-01",
                           "Image": r"C:\x.exe", "TargetFilename": r"C:\Users\a\Desktop\HOW_TO_DECRYPT_FILES.txt"})
        assert "rule.ep.ransom_note" in [d.detector for d in EndpointMonitor().evaluate(ev, RULES)]

    def test_winlogbeat_format(self):
        ev = parse_sysmon({"@timestamp": "2026-10-22T14:00:00.000Z", "winlog": {
            "event_id": 1, "computer_name": "LAB-3", "record_id": 77,
            "event_data": {"Image": r"C:\Windows\System32\vssadmin.exe", "CommandLine": "vssadmin delete shadows /all"}}})
        assert ev.event_id == 1 and ev.host == "lab-3" and ev.record_id == "77"


class TestAuthRules:
    def test_brute_force_then_success(self):
        m = AuthMonitor()
        alerts = []
        for i in range(10):
            alerts += m.evaluate(AuthEvent(T0 + timedelta(seconds=i), "dr.smith", "failure", "10.0.9.9", "ehr-01", "ehr"), RULES)
        assert any(a.category == "brute_force" for a in alerts)
        ok = m.evaluate(AuthEvent(T0 + timedelta(seconds=20), "dr.smith", "success", "10.0.9.9", "ehr-01", "ehr"), RULES)
        assert [a.category for a in ok] == ["brute_force_success"] and ok[0].severity == "critical"

    def test_failures_outside_window_do_not_accumulate(self):
        m = AuthMonitor()
        alerts = []
        for i in range(12):
            alerts += m.evaluate(AuthEvent(T0 + timedelta(minutes=10 * i), "nurse2", "failure", "10.0.1.1"), RULES)
        assert alerts == []

    def test_password_spraying(self):
        m = AuthMonitor()
        alerts = []
        for i in range(10):
            alerts += m.evaluate(AuthEvent(T0 + timedelta(seconds=i), f"user{i}", "failure", "203.0.113.50"), RULES)
        assert any(a.category == "password_spraying" for a in alerts)

    def test_offhours_privileged_login(self):
        out = AuthMonitor().evaluate(AuthEvent(T0.replace(hour=2), "Administrator", "success", "10.0.0.5", "dc-01"), RULES)
        assert [a.category for a in out] == ["offhours_privileged_login"]

    def test_normal_daytime_login_is_quiet(self):
        assert AuthMonitor().evaluate(AuthEvent(T0, "nurse1", "success", "10.0.0.5", "ehr-01"), RULES) == []


class TestFlowPolicy:
    INTERNAL = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]

    def test_large_upload_to_external(self):
        out = evaluate_flow_policy(src_ip="10.1.2.3", dst_ip="8.8.4.4", dst_port=443, out_bytes=500e6, in_bytes=1e6,
                                   rules=RULES, internal_cidrs=self.INTERNAL, source="zeek", is_simulated=False)
        assert [a.category for a in out] == ["potential_exfiltration"]

    def test_medical_device_egress_and_port(self):
        rules = {**RULES, "clinical_device_cidrs": ["10.50.0.0/16"]}
        out = evaluate_flow_policy(src_ip="10.50.1.7", dst_ip="1.1.1.1", dst_port=6667, out_bytes=1e3, in_bytes=1e3,
                                   rules=rules, internal_cidrs=self.INTERNAL, source="zeek", is_simulated=False)
        assert {a.category for a in out} == {"medical_device_external_connection", "unexpected_outbound_port"}

    def test_internal_traffic_ignored(self):
        assert evaluate_flow_policy(src_ip="10.1.2.3", dst_ip="10.9.9.9", dst_port=9999, out_bytes=1e9, in_bytes=0,
                                    rules=RULES, internal_cidrs=self.INTERNAL, source="zeek", is_simulated=False) == []
