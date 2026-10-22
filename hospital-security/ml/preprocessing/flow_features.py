"""Network-flow schema, label mapping and telemetry normalisation.

Two feature sets are used:

* ``CIC_FEATURES`` – the 77 numeric CICFlowMeter columns of CSE-CIC-IDS2018.
  Used for CSV batch analysis of CICFlowMeter output.
* ``PORTABLE_FEATURES`` – 12 features that can also be computed from a Zeek
  ``conn.log`` record or a Suricata EVE ``flow`` event. Used for live
  telemetry. See ``docs/telemetry-compatibility.md`` for the caveats.
"""

from __future__ import annotations

import math
from typing import Any

LABEL_COLUMN = "Label"

# CSE-CIC-IDS2018 label -> category shown in the dashboard.
LABEL_TO_CATEGORY: dict[str, str] = {
    "Benign": "benign",
    "FTP-BruteForce": "brute_force",
    "SSH-Bruteforce": "brute_force",
    "Brute Force -Web": "web_attack",
    "Brute Force -XSS": "web_attack",
    "SQL Injection": "web_attack",
    "DoS attacks-GoldenEye": "dos",
    "DoS attacks-Slowloris": "dos",
    "DoS attacks-SlowHTTPTest": "dos",
    "DoS attacks-Hulk": "dos",
    "DDOS attack-HOIC": "ddos",
    "DDOS attack-LOIC-UDP": "ddos",
    "DDoS attacks-LOIC-HTTP": "ddos",
    "Bot": "botnet",
    "Infilteration": "infiltration",
}

CATEGORY_INFO: dict[str, dict[str, str]] = {
    "benign": {"title": "Benign traffic", "mitre": "", "severity": "info"},
    "brute_force": {"title": "Credential brute force (FTP/SSH)", "mitre": "T1110", "severity": "high"},
    "web_attack": {"title": "Web application attack (brute force, XSS, SQLi)", "mitre": "T1190", "severity": "high"},
    "dos": {"title": "Denial of service", "mitre": "T1499", "severity": "high"},
    "ddos": {"title": "Distributed denial of service", "mitre": "T1498", "severity": "critical"},
    "botnet": {"title": "Botnet command-and-control", "mitre": "T1071", "severity": "critical"},
    "infiltration": {"title": "Internal infiltration / lateral activity", "mitre": "T1021", "severity": "critical"},
}

CIC_FEATURES: list[str] = [
    "Dst Port", "Protocol", "Flow Duration", "Tot Fwd Pkts", "Tot Bwd Pkts", "TotLen Fwd Pkts",
    "TotLen Bwd Pkts", "Fwd Pkt Len Max", "Fwd Pkt Len Min", "Fwd Pkt Len Mean", "Fwd Pkt Len Std",
    "Bwd Pkt Len Max", "Bwd Pkt Len Min", "Bwd Pkt Len Mean", "Bwd Pkt Len Std", "Flow Byts/s",
    "Flow Pkts/s", "Flow IAT Mean", "Flow IAT Std", "Flow IAT Max", "Flow IAT Min", "Fwd IAT Tot",
    "Fwd IAT Mean", "Fwd IAT Std", "Fwd IAT Max", "Fwd IAT Min", "Bwd IAT Tot", "Bwd IAT Mean",
    "Bwd IAT Std", "Bwd IAT Max", "Bwd IAT Min", "Fwd PSH Flags", "Bwd PSH Flags", "Fwd URG Flags",
    "Bwd URG Flags", "Fwd Header Len", "Bwd Header Len", "Fwd Pkts/s", "Bwd Pkts/s", "Pkt Len Min",
    "Pkt Len Max", "Pkt Len Mean", "Pkt Len Std", "Pkt Len Var", "FIN Flag Cnt", "SYN Flag Cnt",
    "RST Flag Cnt", "PSH Flag Cnt", "ACK Flag Cnt", "URG Flag Cnt", "CWE Flag Count", "ECE Flag Cnt",
    "Down/Up Ratio", "Pkt Size Avg", "Fwd Seg Size Avg", "Bwd Seg Size Avg", "Fwd Byts/b Avg",
    "Fwd Pkts/b Avg", "Fwd Blk Rate Avg", "Bwd Byts/b Avg", "Bwd Pkts/b Avg", "Bwd Blk Rate Avg",
    "Subflow Fwd Pkts", "Subflow Fwd Byts", "Subflow Bwd Pkts", "Subflow Bwd Byts", "Init Fwd Win Byts",
    "Init Bwd Win Byts", "Fwd Act Data Pkts", "Fwd Seg Size Min", "Active Mean", "Active Std",
    "Active Max", "Active Min", "Idle Mean", "Idle Std", "Idle Max", "Idle Min",
]

PORTABLE_FEATURES: list[str] = [
    "dst_port", "protocol", "duration_us", "fwd_pkts", "bwd_pkts", "fwd_bytes", "bwd_bytes",
    "bytes_per_s", "pkts_per_s", "fwd_pkt_mean", "bwd_pkt_mean", "down_up_ratio",
]

PROTO_NUMBERS = {"tcp": 6, "udp": 17, "icmp": 1, "ipv6-icmp": 58, "icmpv6": 58}

# Minimum IP + transport header bytes per packet, used to turn Suricata's
# full-packet byte counters into payload bytes comparable to CICFlowMeter.
_HEADER_BYTES = {6: 40, 17: 28, 1: 28}


def portable_from_counts(
    dst_port: int, protocol: int, duration_s: float, fwd_pkts: int, bwd_pkts: int,
    fwd_bytes: float, bwd_bytes: float,
) -> dict[str, float]:
    duration_us = max(duration_s, 0.0) * 1e6
    total_pkts = fwd_pkts + bwd_pkts
    total_bytes = fwd_bytes + bwd_bytes
    dur_s = duration_us / 1e6
    return {
        "dst_port": float(dst_port),
        "protocol": float(protocol),
        "duration_us": duration_us,
        "fwd_pkts": float(fwd_pkts),
        "bwd_pkts": float(bwd_pkts),
        "fwd_bytes": float(fwd_bytes),
        "bwd_bytes": float(bwd_bytes),
        "bytes_per_s": total_bytes / dur_s if dur_s > 0 else 0.0,
        "pkts_per_s": total_pkts / dur_s if dur_s > 0 else 0.0,
        "fwd_pkt_mean": fwd_bytes / fwd_pkts if fwd_pkts else 0.0,
        "bwd_pkt_mean": bwd_bytes / bwd_pkts if bwd_pkts else 0.0,
        "down_up_ratio": float(bwd_pkts // fwd_pkts) if fwd_pkts else 0.0,
    }


def portable_from_cic_row(row: dict[str, Any]) -> dict[str, float]:
    dur_us = float(row["Flow Duration"])
    return portable_from_counts(
        int(row["Dst Port"]), int(row["Protocol"]), dur_us / 1e6, int(row["Tot Fwd Pkts"]),
        int(row["Tot Bwd Pkts"]), float(row["TotLen Fwd Pkts"]), float(row["TotLen Bwd Pkts"]),
    )


def _num(v: Any, default: float = 0.0) -> float:
    if v is None or v == "-" or v == "":
        return default
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    return f if math.isfinite(f) else default


def portable_from_zeek_conn(rec: dict[str, Any]) -> dict[str, float]:
    """Zeek conn.log: orig_bytes / resp_bytes are payload bytes, like CICFlowMeter."""
    proto = PROTO_NUMBERS.get(str(rec.get("proto", "")).lower(), 0)
    return portable_from_counts(
        int(_num(rec.get("id.resp_p"))), proto, _num(rec.get("duration")),
        int(_num(rec.get("orig_pkts"))), int(_num(rec.get("resp_pkts"))),
        _num(rec.get("orig_bytes")), _num(rec.get("resp_bytes")),
    )


def portable_from_suricata_flow(ev: dict[str, Any]) -> dict[str, float]:
    """Suricata EVE flow: byte counters include headers, so an estimate is subtracted."""
    from datetime import datetime

    flow = ev.get("flow", {})
    proto = PROTO_NUMBERS.get(str(ev.get("proto", "")).lower(), int(_num(ev.get("proto"), 0)))
    try:
        start = datetime.fromisoformat(str(flow["start"]).replace("Z", "+00:00"))
        end = datetime.fromisoformat(str(flow["end"]).replace("Z", "+00:00"))
        duration = max((end - start).total_seconds(), 0.0)
    except (KeyError, ValueError):
        duration = 0.0
    fwd_pkts = int(_num(flow.get("pkts_toserver")))
    bwd_pkts = int(_num(flow.get("pkts_toclient")))
    hdr = _HEADER_BYTES.get(proto, 28)
    fwd_bytes = max(_num(flow.get("bytes_toserver")) - hdr * fwd_pkts, 0.0)
    bwd_bytes = max(_num(flow.get("bytes_toclient")) - hdr * bwd_pkts, 0.0)
    return portable_from_counts(int(_num(ev.get("dest_port"))), proto, duration, fwd_pkts, bwd_pkts,
                                fwd_bytes, bwd_bytes)
