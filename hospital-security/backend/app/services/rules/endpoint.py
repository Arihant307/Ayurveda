"""Ransomware and endpoint behaviour rules over Windows Sysmon telemetry.

No public, labelled endpoint-telemetry dataset of ransomware behaviour was
available to this project, so there is deliberately no ML model here. These
rules encode well-documented pre-encryption and encryption behaviours
(MITRE ATT&CK T1490, T1486, T1070.001, T1562.001, T1059.001, T1204.002) and
were validated with synthetic events only (tests/test_endpoint_rules.py).

Supported Sysmon event IDs: 1 (process create), 3 (network connection),
11 (file create), 22 (DNS query), 23/26 (file delete). Fields follow the
Sysmon schema; Winlogbeat (``winlog.event_data``) and flat JSON are accepted.
"""

from __future__ import annotations

import re
import threading
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.services.alerts import AlertDraft

RULESET_VERSION = "endpoint-rules-1.0"

RANSOM_EXTENSIONS = (
    ".locked", ".encrypted", ".crypt", ".crypted", ".enc", ".lockbit", ".conti", ".ryk", ".ryuk", ".wncry",
    ".wnry", ".cerber", ".locky", ".zepto", ".odin", ".thor", ".aesir", ".sage", ".djvu", ".phobos", ".makop",
    ".blackcat", ".hive", ".basta", ".royal", ".akira", ".rhysida", ".medusa", ".play", ".clop", ".8base",
)
RANSOM_NOTE_RE = re.compile(
    r"(?i)(how[_ -]?to[_ -]?(decrypt|restore|recover)|readme[_ -]?(for[_ -]?)?decrypt|restore[_ -]?my[_ -]?files|"
    r"decrypt[_ -]?(instructions|files)|!+[_ -]?read[_ -]?me|your[_ -]?files[_ -]?are[_ -]?encrypted|"
    r"recover[_ -]?files|ransom)[^\\/]*\.(txt|html?|hta|rtf)$"
)
OFFICE_PARENTS = ("winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe", "onenote.exe", "mspub.exe")
SHELLS = ("cmd.exe", "powershell.exe", "pwsh.exe", "wscript.exe", "cscript.exe", "mshta.exe", "rundll32.exe",
          "regsvr32.exe", "certutil.exe", "bitsadmin.exe")


@dataclass
class Rule:
    id: str
    title: str
    severity: str
    mitre: str
    description: str
    image: tuple[str, ...] = ()
    cmd_patterns: tuple[str, ...] = ()
    parent: tuple[str, ...] = ()


PROCESS_RULES: list[Rule] = [
    Rule("ep.shadow_copy_delete", "Volume shadow copies deleted", "critical", "T1490",
         "Deleting shadow copies prevents recovery and is a near-universal ransomware pre-encryption step.",
         cmd_patterns=(r"vssadmin(\.exe)?\s+.*delete\s+shadows", r"wmic(\.exe)?\s+.*shadowcopy\s+delete",
                       r"win32_shadowcopy.*(delete|remove)", r"vssadmin(\.exe)?\s+resize\s+shadowstorage")),
    Rule("ep.backup_catalog_delete", "Windows backup catalog deleted", "critical", "T1490",
         "wbadmin deletion of backups or the backup catalog destroys restore points.",
         cmd_patterns=(r"wbadmin(\.exe)?\s+delete\s+(catalog|systemstatebackup|backup)",)),
    Rule("ep.recovery_disabled", "Boot recovery disabled", "high", "T1490",
         "bcdedit changes that disable Windows recovery are used by ransomware to block repair.",
         cmd_patterns=(r"bcdedit(\.exe)?\s+.*recoveryenabled\s+no", r"bcdedit(\.exe)?\s+.*bootstatuspolicy\s+ignoreallfailures")),
    Rule("ep.event_log_cleared", "Event logs cleared", "high", "T1070.001",
         "Clearing event logs removes forensic evidence.",
         cmd_patterns=(r"wevtutil(\.exe)?\s+(cl|clear-log)\b", r"clear-eventlog")),
    Rule("ep.defender_tamper", "Security tooling disabled", "high", "T1562.001",
         "Attempts to disable Microsoft Defender or stop security services.",
         cmd_patterns=(r"set-mppreference\s+.*-disable(realtimemonitoring|behaviormonitoring|ioavprotection)\s+\$?true",
                       r"sc(\.exe)?\s+(stop|delete|config)\s+(windefend|sense|wdnissvc)",
                       r"add-mppreference\s+.*-exclusionpath")),
    Rule("ep.cipher_wipe", "Free-space wipe with cipher /w", "medium", "T1485",
         "cipher /w overwrites deleted data and is used to stop recovery of original files after encryption.",
         cmd_patterns=(r"cipher(\.exe)?\s+/w",)),
    Rule("ep.encoded_powershell", "Encoded PowerShell command", "medium", "T1059.001",
         "Base64-encoded PowerShell hides the command being run.",
         image=("powershell.exe", "pwsh.exe"), cmd_patterns=(r"\s-(e|en|enc|enco|encod|encode|encodedcommand)\s+[a-z0-9+/=]{20,}",)),
    Rule("ep.office_spawns_shell", "Office application spawned a shell", "high", "T1204.002",
         "A document or e-mail client starting a script host is typical of a malicious attachment or macro.",
         image=SHELLS, parent=OFFICE_PARENTS),
]


def _basename(path: str) -> str:
    return re.split(r"[\\/]", path or "")[-1].lower()


def _get(ev: dict[str, Any], *names: str) -> str:
    data = ev.get("winlog", {}).get("event_data", {}) if isinstance(ev.get("winlog"), dict) else {}
    for n in names:
        for src in (ev, data, ev.get("EventData", {}) if isinstance(ev.get("EventData"), dict) else {}):
            if n in src and src[n] not in (None, ""):
                return str(src[n])
    return ""


@dataclass
class SysmonEvent:
    event_id: int
    timestamp: datetime
    host: str
    user: str = ""
    image: str = ""
    command_line: str = ""
    parent_image: str = ""
    target_filename: str = ""
    process_guid: str = ""
    process_id: str = ""
    source_ip: str = ""
    destination_ip: str = ""
    destination_port: int | None = None
    query_name: str = ""
    record_id: str = ""
    hashes: str = ""
    raw_fields: dict[str, str] = field(default_factory=dict)


def parse_sysmon(ev: dict[str, Any]) -> SysmonEvent:
    eid_raw = ev.get("EventID", ev.get("event_id", ev.get("winlog", {}).get("event_id") if isinstance(ev.get("winlog"), dict) else None))
    if eid_raw is None and isinstance(ev.get("event"), dict):
        eid_raw = ev["event"].get("code")
    try:
        eid = int(eid_raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("Sysmon event without a numeric EventID") from exc
    ts_raw = _get(ev, "UtcTime", "@timestamp", "TimeCreated", "timestamp")
    ts = _parse_time(ts_raw)
    host = _get(ev, "Computer", "computer_name", "hostname") or (
        ev.get("host", {}).get("name", "") if isinstance(ev.get("host"), dict) else str(ev.get("host", "")))
    if not host and isinstance(ev.get("winlog"), dict):
        host = str(ev["winlog"].get("computer_name", ""))
    port = _get(ev, "DestinationPort")
    return SysmonEvent(
        event_id=eid, timestamp=ts, host=host.lower(), user=_get(ev, "User"), image=_get(ev, "Image"),
        command_line=_get(ev, "CommandLine"), parent_image=_get(ev, "ParentImage"),
        target_filename=_get(ev, "TargetFilename"), process_guid=_get(ev, "ProcessGuid"),
        process_id=_get(ev, "ProcessId"), source_ip=_get(ev, "SourceIp"), destination_ip=_get(ev, "DestinationIp"),
        destination_port=int(port) if port.isdigit() else None, query_name=_get(ev, "QueryName").lower().rstrip("."),
        record_id=_get(ev, "EventRecordID", "RecordID", "record_id") or (
            str(ev.get("winlog", {}).get("record_id", "")) if isinstance(ev.get("winlog"), dict) else ""),
        hashes=_get(ev, "Hashes"),
    )


def _parse_time(raw: str) -> datetime:
    if not raw:
        return datetime.now(UTC)
    raw = raw.strip().replace("Z", "+00:00")
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw[:26], fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(raw)
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    except ValueError:
        return datetime.now(UTC)


class EndpointMonitor:
    def __init__(self) -> None:
        self.file_activity: dict[str, deque[tuple[float, str]]] = defaultdict(deque)
        self.lock = threading.Lock()
        self.compiled = [(r, [re.compile(p, re.I) for p in r.cmd_patterns]) for r in PROCESS_RULES]

    def reset(self) -> None:
        self.__init__()

    def evaluate(self, ev: SysmonEvent, rules_cfg: dict[str, Any], source: str = "sysmon",
                 is_simulated: bool = False) -> list[AlertDraft]:
        out: list[AlertDraft] = []
        base = dict(module="endpoint", source=source, is_simulated=is_simulated, detector_version=RULESET_VERSION,
                    host=ev.host, user_name=ev.user)
        evidence_base = {"event_id": ev.event_id, "utc_time": ev.timestamp.isoformat(), "image": ev.image,
                         "command_line": ev.command_line[:2000], "parent_image": ev.parent_image,
                         "process_id": ev.process_id, "record_id": ev.record_id, "hashes": ev.hashes}
        if ev.event_id == 1:
            img, parent, cmd = _basename(ev.image), _basename(ev.parent_image), ev.command_line
            for rule, patterns in self.compiled:
                if rule.image and img not in rule.image:
                    continue
                if rule.parent and parent not in rule.parent:
                    continue
                if patterns and not any(p.search(cmd) for p in patterns):
                    continue
                if not patterns and not (rule.image or rule.parent):
                    continue
                out.append(AlertDraft(
                    category="ransomware_precursor" if rule.mitre in ("T1490", "T1485") else "suspicious_process",
                    title=f"{rule.title} on {ev.host}", description=rule.description, severity=rule.severity,
                    confidence=1.0, detector=f"rule.{rule.id}", mitre_technique=rule.mitre,
                    evidence={**evidence_base, "rule": rule.id},
                    aggregation_key=f"{rule.id}|{ev.host}|{img}", **base))
        elif ev.event_id in (11, 23, 26) and ev.target_filename:
            fname = ev.target_filename
            lower = fname.lower()
            if ev.event_id == 11 and RANSOM_NOTE_RE.search(_basename(fname)):
                out.append(AlertDraft(
                    category="ransomware_activity", title=f"Ransom-note-like file created on {ev.host}",
                    description="A file named like a ransom note was written.", severity="critical", confidence=0.9,
                    detector="rule.ep.ransom_note", mitre_technique="T1486",
                    evidence={**evidence_base, "target_filename": fname},
                    aggregation_key=f"ransom_note|{ev.host}", **base))
            key = f"{ev.host}|{ev.process_guid or ev.image}"
            window = float(rules_cfg["mass_file_window_seconds"])
            ts = ev.timestamp.timestamp()
            with self.lock:
                q = self.file_activity[key]
                q.append((ts, lower))
                while q and ts - q[0][0] > window:
                    q.popleft()
                files = list(q)
            threshold = int(rules_cfg["mass_file_threshold"])
            if len(files) >= threshold:
                ransom_ext = [f for _, f in files if f.endswith(RANSOM_EXTENSIONS)]
                exts = [f.rsplit(".", 1)[-1] for _, f in files if "." in _basename(f)]
                top_ext, top_n = max(((e, exts.count(e)) for e in set(exts)), key=lambda t: t[1], default=("", 0))
                uniform_new_ext = top_n >= 0.8 * len(files) and top_ext not in ("tmp", "log", "etl", "dat")
                is_ransom = bool(ransom_ext) or uniform_new_ext
                out.append(AlertDraft(
                    category="ransomware_activity" if is_ransom else "mass_file_modification",
                    title=(f"Possible ransomware encryption on {ev.host}: {len(files)} files in {int(window)}s"
                           if is_ransom else f"Mass file activity on {ev.host}: {len(files)} files in {int(window)}s"),
                    description=("High-rate file writes by one process with ransomware-style extensions."
                                 if is_ransom else "One process wrote or deleted many files quickly. Could be backup, "
                                 "sync or installer activity; verify the process."),
                    severity="critical" if is_ransom else "medium", confidence=0.95 if ransom_ext else (0.8 if is_ransom else 0.5),
                    detector="rule.ep.mass_file_activity", mitre_technique="T1486" if is_ransom else "T1485",
                    evidence={**evidence_base, "files_in_window": len(files), "window_seconds": window,
                              "dominant_extension": top_ext, "ransom_extension_hits": len(ransom_ext),
                              "sample_files": [f for _, f in files[-10:]]},
                    aggregation_key=f"mass_file|{key}", **base))
        return out


endpoint_monitor = EndpointMonitor()
