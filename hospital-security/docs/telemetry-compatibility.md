# Live telemetry: integrations and compatibility limits

Only connect sensors on networks and endpoints you are **authorised** to monitor.

## What is verified

| Source | Ingestion | Verified with |
|---|---|---|
| **Suricata 7 EVE JSON** (`flow`, `alert`, `dns`, `http`, `tls`) | file tailer (`SURICATA_EVE_PATH`) or `POST /api/v1/ingest/suricata` | **Live capture**: Suricata 7.0.3 on the loopback interface of the development container, watching the platform's own HTTP traffic, with the custom rule in `deploy/suricata/local.rules`. The tailer ingested all 90 EVE lines (0 errors, 0 duplicates), the rule matches became alerts within seconds, and flows were scored by `network_portable`. A recorded sample of that output is the test fixture `tests/fixtures/suricata_eve_selftest.jsonl`. |
| **Zeek** `conn`, `dns`, `http`, `ssh`, `ssl` (TSV with `#fields` header, or JSON lines) | file tailer (`ZEEK_LOG_DIR/<type>.log`) or `POST /api/v1/ingest/zeek` | Parser and pipeline tests using records in the documented Zeek format. **Zeek itself was not run**: no Zeek package was available for the build OS, so a live Zeek sensor has not been verified. |
| **Windows Sysmon** event IDs 1, 3, 11, 22, 23, 26 (flat JSON or Winlogbeat `winlog.event_data`) | file tailer (`SYSMON_LOG_PATH`, JSON lines) or `POST /api/v1/ingest/sysmon` | Synthetic events only (no Windows host was available). |
| **Authentication events** (EHR, VPN, AD, SSH) | `POST /api/v1/ingest/auth`; Zeek `ssh.log` `auth_attempts` / `auth_success` | Synthetic events. |

The tailers persist inode and offset in `ingest_sources`, so they resume after a restart. They also follow
rotation and truncation, never read a half-written line, retry with exponential backoff (up to 60 s), and
report `waiting_for_file`, `connected`, `stale` (no events for `TELEMETRY_STALE_SECONDS`) or `error`, with the
last error. Duplicates are dropped by a unique `(source, dedup_key)` built from Zeek `uid`, Suricata
`flow_id` + event type + timestamp, or Sysmon host + `EventRecordID`.

## Feature mapping for the flow model

The live flow model (`network_portable`) uses 12 features that both CICFlowMeter and the sensors provide:

| Feature | CICFlowMeter (training) | Zeek `conn.log` | Suricata EVE `flow` |
|---|---|---|---|
| dst_port | Dst Port | `id.resp_p` | `dest_port` |
| protocol | Protocol | `proto` → 6/17/1 | `proto` → 6/17/1 |
| duration_us | Flow Duration (µs) | `duration` × 10⁶ | `flow.end − flow.start` |
| fwd_pkts / bwd_pkts | Tot Fwd / Bwd Pkts | `orig_pkts` / `resp_pkts` | `pkts_toserver` / `pkts_toclient` |
| fwd_bytes / bwd_bytes | TotLen Fwd / Bwd Pkts (payload) | `orig_bytes` / `resp_bytes` (payload) | `bytes_toserver/toclient` − 40 B (TCP) or 28 B (UDP) per packet |
| bytes_per_s, pkts_per_s, fwd/bwd_pkt_mean, down_up_ratio | derived exactly as CICFlowMeter does (checked against the dataset: 100 % / 99.98 % match) | derived | derived |

**Known limitations**

* Flow boundaries differ between tools: CICFlowMeter uses a 120 s activity timeout and splits flows on FIN,
  Zeek and Suricata use their own timeouts. Long connections may be split differently.
* Suricata counts full packets; the per-packet header subtraction is an estimate (IP/TCP options are
  ignored).
* Zeek `orig_bytes` comes from TCP sequence numbers and can over-count on lost packets.
* The 77-feature `network_cic` model (inter-arrival times, flags, window sizes) cannot be fed from Zeek or
  Suricata. Use it for CICFlowMeter CSV exports via `/analyze/network/batch`.
* The model was trained on 2018 lab traffic. It has not seen hospital protocols (HL7, DICOM, IoMT), so
  calibrate thresholds on local benign traffic before relying on it.

## Running Suricata like the verified setup

```bash
sudo apt-get install suricata
sudo suricata -c deploy/suricata/suricata-loopback-selftest.yaml --pcap=lo -k none   # self-test on loopback
SURICATA_EVE_PATH=/var/log/suricata/eve.json uvicorn app.main:app                 # in backend/
curl "http://127.0.0.1:8000/api/v1/health?probe=hs-suricata-selftest"               # triggers sid 9000001
```

In production, run Suricata on a SPAN or TAP interface with your organisation's approved rule set
(e.g. `suricata-update`), and either share `eve.json` with the backend (the docker-compose `suricata` profile
does this) or forward events to `/api/v1/ingest/suricata` with a sensor API key.
