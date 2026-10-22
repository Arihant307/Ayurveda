"""Telemetry ingestion: Zeek/Suricata/Sysmon parsing, tailing, de-duplication, disconnection, correlation, URLhaus."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import httpx
import pytest

from conftest import requires_models

API = "/api/v1"
FIXTURES = Path(__file__).parent / "fixtures"

ZEEK_CONN_TSV = """#separator \\x09
#set_separator\t,
#empty_field\t(empty)
#unset_field\t-
#path\tconn
#fields\tts\tuid\tid.orig_h\tid.orig_p\tid.resp_h\tid.resp_p\tproto\tservice\tduration\torig_bytes\tresp_bytes\tconn_state\tlocal_orig\tlocal_resp\tmissed_bytes\thistory\torig_pkts\torig_ip_bytes\tresp_pkts\tresp_ip_bytes\ttunnel_parents
#types\ttime\tstring\taddr\tport\taddr\tport\tenum\tstring\tinterval\tcount\tcount\tstring\tbool\tbool\tcount\tstring\tcount\tcount\tcount\tcount\tset[string]
1761130000.000001\tCa1\t10.0.5.20\t51000\t10.0.1.10\t22\ttcp\tssh\t2.5\t1200\t1900\tSF\tT\tT\t0\tShAdDaFf\t12\t1832\t11\t2472\t-
1761130001.000001\tCa2\t10.20.3.4\t52000\t93.184.216.34\t443\ttcp\tssl\t60.0\t250000000\t40000\tSF\tT\tF\t0\tShADadFf\t180000\t259000000\t9000\t400000\t-
"""


def test_zeek_tsv_parser():
    from app.services.telemetry.tailer import parse_zeek_line, parse_zeek_tsv_header

    lines = ZEEK_CONN_TSV.splitlines(keepends=True)
    fields, sep, unset = parse_zeek_tsv_header([ln for ln in lines if ln.startswith("#")])
    assert sep == "\t" and fields[0] == "ts" and "orig_bytes" in fields
    rec = parse_zeek_line(lines[7], fields, sep, unset)
    assert rec["uid"] == "Ca1" and rec["id.resp_p"] == "22" and rec["tunnel_parents"] is None


@requires_models
def test_zeek_ingest_dedup_and_exfil_rule(client, analyst_headers):
    from app.services.telemetry.tailer import parse_zeek_line, parse_zeek_tsv_header

    lines = ZEEK_CONN_TSV.splitlines(keepends=True)
    fields, sep, unset = parse_zeek_tsv_header([ln for ln in lines if ln.startswith("#")])
    events = [parse_zeek_line(ln, fields, sep, unset) for ln in lines if not ln.startswith("#")]
    r = client.post(f"{API}/ingest/zeek", headers=analyst_headers, json={"log_type": "conn", "events": events})
    assert r.json()["processed"] == 2
    again = client.post(f"{API}/ingest/zeek", headers=analyst_headers, json={"log_type": "conn", "events": events})
    assert again.json()["duplicates"] == 2 and again.json()["processed"] == 0
    alerts = client.get(f"{API}/alerts?category=potential_exfiltration", headers=analyst_headers).json()["items"]
    assert any(a["src_ip"] == "10.20.3.4" and a["source"] == "zeek" for a in alerts)


@requires_models
def test_recorded_suricata_eve_ingest(client, analyst_headers):
    """Replays EVE output recorded from a live Suricata 7.0.3 capture during development."""
    events = [json.loads(ln) for ln in (FIXTURES / "suricata_eve_selftest.jsonl").read_text().splitlines()]
    r = client.post(f"{API}/ingest/suricata", headers=analyst_headers, json={"events": events, "is_simulated": True}).json()
    assert r["processed"] == len(events) and not r["errors"]
    page = client.get(f"{API}/alerts?source=suricata", headers=analyst_headers).json()
    sig = [a for a in page["items"] if a["detector"] == "suricata:sid:9000001"]
    assert sig and sig[0]["is_simulated"] and sig[0]["occurrences"] >= 3


def test_sysmon_ingest_raises_ransomware_alert(client, analyst_headers):
    ev = {"EventID": 1, "UtcTime": "2026-10-22 14:00:00.000", "Computer": "RADIOLOGY-WS3", "User": "HOSP\\tech",
          "Image": r"C:\Windows\System32\vssadmin.exe", "CommandLine": "vssadmin.exe delete shadows /all /quiet",
          "ParentImage": r"C:\Windows\System32\cmd.exe", "EventRecordID": 4242}
    r = client.post(f"{API}/ingest/sysmon", headers=analyst_headers, json={"events": [ev, ev], "is_simulated": True}).json()
    assert r["processed"] == 1 and r["duplicates"] == 1
    items = client.get(f"{API}/alerts?module=endpoint", headers=analyst_headers).json()["items"]
    a = next(a for a in items if a["host"] == "radiology-ws3")
    assert a["severity"] == "critical" and a["detector_version"].startswith("endpoint-rules") and a["evidence"]["record_id"] == "4242"


def test_sysmon_malformed_event_reported(client, analyst_headers):
    r = client.post(f"{API}/ingest/sysmon", headers=analyst_headers, json={"events": [{"Image": "x"}]}).json()
    assert r["processed"] == 0 and r["errors"]


def test_auth_ingest_brute_force(client, analyst_headers):
    evs = [{"timestamp": f"2026-10-22T09:00:{i:02d}Z", "user": "dr.jones", "outcome": "failure",
            "source_ip": "10.8.8.8", "host": "ehr-app-01", "service": "ehr", "event_id": f"bf-{i}"} for i in range(12)]
    evs.append({"timestamp": "2026-10-22T09:00:30Z", "user": "dr.jones", "outcome": "success", "source_ip": "10.8.8.8",
                "host": "ehr-app-01", "service": "ehr", "event_id": "bf-ok"})
    r = client.post(f"{API}/ingest/auth", headers=analyst_headers, json={"events": evs}).json()
    assert r["processed"] == 13
    cats = {a["category"] for a in client.get(f"{API}/alerts?module=auth", headers=analyst_headers).json()["items"]}
    assert {"brute_force", "brute_force_success"} <= cats


@requires_models
def test_correlation_phishing_email_then_dns_lookup(client, analyst_headers):
    """E-mail with a phishing link, then a workstation resolves that domain -> correlated incident."""
    email = {"subject": "Verify your account", "sender": "IT <it@mail-notice.example>",
             "body": "Your mailbox is suspended. Verify your account and confirm your password at "
                     "http://staff-login.hospital-portal-verify.top/owa immediately."}
    e = client.post(f"{API}/analyze/email", headers=analyst_headers, json=email).json()
    assert e["is_threat"] and "hospital-portal-verify.top" in e["url_domains"]
    dns = {"timestamp": "2026-10-22T10:00:00.000000+0000", "flow_id": 99, "event_type": "dns", "src_ip": "10.4.4.4",
           "dest_ip": "10.0.0.53", "dest_port": 53, "proto": "UDP",
           "dns": {"type": "query", "id": 1, "rrname": "hospital-portal-verify.top", "rrtype": "A"}}
    client.post(f"{API}/ingest/suricata", headers=analyst_headers, json={"events": [dns]})
    contact = client.get(f"{API}/alerts?category=contact_with_flagged_domain", headers=analyst_headers).json()["items"]
    assert contact and contact[0]["src_ip"] == "10.4.4.4" and contact[0]["incident_id"]
    inc = client.get(f"{API}/incidents/{contact[0]['incident_id']}", headers=analyst_headers).json()
    assert set(inc["modules"]) >= {"email", "network"} and e["alert_id"] in inc["alert_ids"]
    assert {"kind": "domain", "value": "hospital-portal-verify.top"} in inc["shared_entities"]
    assert inc["status"] == "open"  # correlation never confirms an incident by itself
    r = client.patch(f"{API}/incidents/{inc['id']}", headers=analyst_headers, json={"status": "confirmed", "notes": "user clicked"})
    assert r.json()["status"] == "confirmed"


def test_tailer_follows_file_rotation_and_reports_disconnection(tmp_path, db):
    from app.models.db_models import IngestSource
    from app.services.telemetry.tailer import FileTailer

    seen: list[dict] = []
    path = tmp_path / "eve.json"
    t = FileTailer("test-eve", "suricata", path, lambda _lt, rec: seen.append(rec) or "processed", poll_seconds=0.05)
    assert t._read_once() == 0
    st = db.query(IngestSource).filter_by(name="test-eve").one()
    assert st.status == "waiting_for_file"
    path.write_text('{"event_type":"flow","n":1}\n{"event_type":"flow","n":2}\n{"partial":')
    assert t._read_once() == 2 and [r["n"] for r in seen] == [1, 2]
    with path.open("a") as f:
        f.write('true}\n')
    t._read_once()
    assert seen[-1] == {"partial": True}
    os.replace(path, tmp_path / "eve.json.1")  # rotation: new file, new inode
    path.write_text('{"event_type":"flow","n":3}\n')
    t._read_once()
    assert seen[-1]["n"] == 3
    db.expire_all()
    st = db.query(IngestSource).filter_by(name="test-eve").one()
    assert st.events_total == 4 and st.status == "connected" and st.last_event_at is not None
    path.unlink()
    t._read_once()
    db.expire_all()
    assert db.query(IngestSource).filter_by(name="test-eve").one().status == "waiting_for_file"


def test_tailer_thread_retries_after_errors(tmp_path, db):
    from app.models.db_models import IngestSource
    from app.services.telemetry.tailer import FileTailer

    path = tmp_path / "sysmon.json"
    path.write_text('{"EventID": 1}\nnot json\n')
    calls = []
    t = FileTailer("test-sysmon", "sysmon", path, lambda _lt, rec: calls.append(rec) or "processed", poll_seconds=0.05)
    t.start()
    deadline = time.time() + 5
    while time.time() < deadline and not calls:
        time.sleep(0.05)
    time.sleep(0.2)
    t.stop()
    t.join(2)
    db.expire_all()
    st = db.query(IngestSource).filter_by(name="test-sysmon").one()
    assert len(calls) == 1 and st.errors_total == 1 and st.events_total == 1


class TestUrlhaus:
    def _client(self, handler):
        return httpx.Client(transport=httpx.MockTransport(handler))

    def test_unreachable_feed(self, db):
        from app.services import threat_intel

        def boom(request):
            raise httpx.ConnectError("proxy refused", request=request)

        st = threat_intel.refresh(db, self._client(boom))
        assert st.status == "unavailable" and "ConnectError" in st.last_error and st.next_attempt_at

    def test_unauthorized_and_rate_limited(self, db):
        from app.services import threat_intel

        st = threat_intel.refresh(db, self._client(lambda r: httpx.Response(401)))
        assert st.status == "unauthorized" and "URLHAUS_AUTH_KEY" in st.last_error
        st = threat_intel.refresh(db, self._client(lambda r: httpx.Response(429, headers={"Retry-After": "120"})))
        assert st.status == "rate_limited"

    @requires_models
    def test_feed_ok_and_enrichment(self, db, client, analyst_headers):
        from app.services import threat_intel

        csv = ('# URLhaus recent\n# id,dateadded,url,url_status,last_online,threat,tags,urlhaus_link,reporter\n'
               '"1","2026-10-21 10:00:00","http://malware-drop.example.net/payload.exe","online","2026-10-21 10:00:00",'
               '"malware_download","exe,QakBot","https://urlhaus.abuse.ch/url/1/","tester"\n')
        st = threat_intel.refresh(db, self._client(lambda r: httpx.Response(200, text=csv)))
        assert st.status == "ok" and st.indicators == 2
        d = client.post(f"{API}/analyze/url", headers=analyst_headers,
                        json={"url": "http://malware-drop.example.net/payload.exe"}).json()
        assert d["threat_intel"]["matches"] and d["is_threat"] and d["severity"] in ("high", "critical")


def test_telemetry_status_endpoint(client, analyst_headers):
    d = client.get(f"{API}/telemetry/status", headers=analyst_headers).json()
    assert {"tailers", "feeds", "received_by_source", "configured"} <= set(d)
    assert any(s["source"] == "sysmon" for s in d["received_by_source"])


