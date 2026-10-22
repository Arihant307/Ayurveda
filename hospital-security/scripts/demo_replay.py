"""Demonstration mode: replay data through the real ingestion and detection pipeline, flagged SIMULATED.

    python scripts/demo_replay.py --api http://localhost:8000 --email admin@hospital.local --password ...
    python scripts/demo_replay.py --api-key <sensor key>      # INGEST_API_KEYS entry; e-mail step needs a login

What it sends (every event has is_simulated=true and shows a SIMULATED badge in the UI):
  1. held-out CSE-CIC-IDS2018 test flows (real records the model never trained on), converted to
     Suricata EVE ``flow`` events. The CIC CSVs have no IP addresses, so synthetic RFC 1918
     addresses are assigned (one source per attack label);
  2. a synthetic Sysmon sequence on one workstation: Office spawning PowerShell, shadow-copy
     deletion and mass file renames with a ransomware extension (no ransomware is executed);
  3. a synthetic burst of failed EHR logins followed by a success;
  4. a phishing e-mail, then a workstation DNS lookup of the linked domain (correlation demo).

Nothing here generates random alerts: every alert comes from the models and rules
processing these events exactly as they would process live telemetry.
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
TEST_SPLIT = ROOT / "ml" / "data" / "processed" / "cic2018_test.parquet"
PROTO = {6: "TCP", 17: "UDP", 0: "HOPOPT"}
HEADER = {6: 40, 17: 28}


def cic_to_eve(row: pd.Series, src_ip: str, dst_ip: str, start: datetime, flow_id: int) -> dict:
    proto = int(row["Protocol"])
    fwd, bwd = int(row["Tot Fwd Pkts"]), int(row["Tot Bwd Pkts"])
    hdr = HEADER.get(proto, 28)
    end = start + timedelta(microseconds=float(row["Flow Duration"]))
    return {
        "timestamp": end.strftime("%Y-%m-%dT%H:%M:%S.%f+0000"), "flow_id": flow_id, "event_type": "flow",
        "src_ip": src_ip, "src_port": 40000 + flow_id % 20000, "dest_ip": dst_ip, "dest_port": int(row["Dst Port"]),
        "proto": PROTO.get(proto, str(proto)),
        "flow": {"pkts_toserver": fwd, "pkts_toclient": bwd,
                 "bytes_toserver": int(row["TotLen Fwd Pkts"] + hdr * fwd), "bytes_toclient": int(row["TotLen Bwd Pkts"] + hdr * bwd),
                 "start": start.strftime("%Y-%m-%dT%H:%M:%S.%f+0000"), "end": end.strftime("%Y-%m-%dT%H:%M:%S.%f+0000"),
                 "state": "closed", "reason": "timeout"},
        "replay_label": row["Label"],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--email")
    ap.add_argument("--password")
    ap.add_argument("--api-key")
    ap.add_argument("--flows-per-label", type=int, default=20)
    ap.add_argument("--delay", type=float, default=0.3, help="seconds between batches, to watch alerts arrive live")
    args = ap.parse_args()

    headers: dict[str, str] = {}
    c = httpx.Client(base_url=args.api.rstrip("/") + "/api/v1", timeout=60)
    if args.email and args.password:
        r = c.post("/auth/login", json={"email": args.email, "password": args.password})
        r.raise_for_status()
        headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    elif args.api_key:
        headers["X-API-Key"] = args.api_key
    else:
        sys.exit("Give --email/--password (analyst or admin) or --api-key")
    c.headers.update(headers)
    now = datetime.now(UTC)

    # 1. Held-out network flows
    if TEST_SPLIT.exists():
        test = pd.read_parquet(TEST_SPLIT)
        sample = pd.concat([g.sample(min(len(g), args.flows_per_label), random_state=7)
                            for _, g in test.groupby("Label")])
        labels = sorted(sample["Label"].unique())
        src_for = {lab: f"10.30.{i + 1}.{10 + i}" for i, lab in enumerate(labels)}
        events = [cic_to_eve(row, src_for[row["Label"]], "10.0.1.20", now - timedelta(seconds=len(sample) - i), 9_000_000 + i)
                  for i, (_, row) in enumerate(sample.iterrows())]
        for i in range(0, len(events), 50):
            r = c.post("/ingest/suricata", json={"events": events[i:i + 50], "is_simulated": True})
            r.raise_for_status()
            print(f"flows {i + 1}-{min(i + 50, len(events))}: {r.json()}")
            time.sleep(args.delay)
        print("source IP per replayed CIC label:", src_for)
    else:
        print(f"skip flows: {TEST_SPLIT} missing (run python -m ml.preprocessing.prepare_cic2018)")

    # 2. Endpoint ransomware-behaviour sequence (synthetic Sysmon events)
    host = "WARD7-WS12"
    t = now.strftime("%Y-%m-%d %H:%M:%S.000")
    sysmon = [
        {"EventID": 1, "UtcTime": t, "Computer": host, "User": "HOSP\\nurse.k", "EventRecordID": 880001,
         "Image": r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
         "ParentImage": r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE",
         "CommandLine": "powershell.exe -nop -w hidden -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkA"},
        {"EventID": 1, "UtcTime": t, "Computer": host, "User": "HOSP\\nurse.k", "EventRecordID": 880002,
         "Image": r"C:\Windows\System32\vssadmin.exe", "ParentImage": r"C:\Windows\System32\cmd.exe",
         "CommandLine": "vssadmin.exe Delete Shadows /All /Quiet"},
    ] + [
        {"EventID": 11, "UtcTime": t, "Computer": host, "EventRecordID": 880100 + i, "ProcessGuid": "{demo-guid}",
         "Image": r"C:\Users\Public\update.exe", "TargetFilename": rf"S:\Clinical\Discharge\letter_{i:04d}.docx.locked"}
        for i in range(120)
    ]
    r = c.post("/ingest/sysmon", json={"events": sysmon, "is_simulated": True})
    print("sysmon:", r.json())

    # 3. Authentication abuse
    auth = [{"timestamp": (now - timedelta(seconds=60 - i)).isoformat(), "user": "dr.patel", "outcome": "failure",
             "source_ip": "10.30.99.7", "host": "ehr-app-01", "service": "ehr-portal", "event_id": f"demo-auth-{i}"}
            for i in range(15)]
    auth.append({"timestamp": now.isoformat(), "user": "dr.patel", "outcome": "success", "source_ip": "10.30.99.7",
                 "host": "ehr-app-01", "service": "ehr-portal", "event_id": "demo-auth-ok"})
    print("auth:", c.post("/ingest/auth", json={"events": auth, "is_simulated": True}).json())

    # 4. Phishing e-mail followed by a DNS lookup of its link (needs an analyst session)
    if "Authorization" in headers:
        e = c.post("/analyze/email", json={
            "subject": "Action required: EHR password expires today",
            "sender": "Epic Support <no-reply@epic-careteam-support.top>",
            "body": "Your EHR password expires today. To avoid losing access to patient records, verify your account "
                    "and confirm your password within 24 hours at http://ehr-login.careteam-verify.top/sso"}).json()
        print("e-mail analysis:", {k: e.get(k) for k in ("risk_score", "is_threat", "severity", "alert_id")})
        dns = {"timestamp": now.strftime("%Y-%m-%dT%H:%M:%S.%f+0000"), "flow_id": 9_999_001, "event_type": "dns",
               "src_ip": "10.40.7.12", "dest_ip": "10.0.0.53", "dest_port": 53, "proto": "UDP",
               "dns": {"type": "query", "id": 4242, "rrname": "careteam-verify.top", "rrtype": "A"}}
        print("dns:", c.post("/ingest/suricata", json={"events": [dns], "is_simulated": True}).json())
    print("done — open the dashboard (alerts are labelled SIMULATED)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
