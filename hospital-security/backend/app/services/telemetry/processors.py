"""Normalise Zeek, Suricata EVE, Sysmon and authentication events and route them through detection.

Every processor returns a short status string: "processed", "duplicate" or "ignored".
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.db_models import TelemetryEvent
from app.services import settings_service, threat_intel
from app.services.alerts import AlertDraft, emit
from app.services.correlation import domain_contact_alert
from app.services.detection import (
    FlowContext,
    analyze_flows,
    auth_event,
    dedup_hash,
    endpoint_event,
    flow_policy,
    store_event,
)
from app.services.inference import ModelUnavailable, registry
from app.services.rules.endpoint import parse_sysmon
from app.services.rules.hospital import AuthEvent
from ml.preprocessing.flow_features import portable_from_suricata_flow, portable_from_zeek_conn

log = logging.getLogger("hospital_security.telemetry")

ZEEK_SUPPORTED = ("conn", "dns", "http", "ssh", "ssl")
SURICATA_SUPPORTED = ("flow", "alert", "dns", "http", "tls")


def _ts_epoch(v: Any) -> datetime:
    try:
        return datetime.fromtimestamp(float(v), UTC)
    except (TypeError, ValueError):
        return datetime.now(UTC)


def _ts_iso(v: Any) -> datetime:
    try:
        s = str(v).replace("Z", "+00:00")
        if len(s) > 5 and s[-5] in "+-" and s[-3] != ":":
            s = s[:-2] + ":" + s[-2:]  # Suricata writes +0000
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    except ValueError:
        return datetime.now(UTC)


def _num(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def observe_domain(db: Session, ev: TelemetryEvent) -> None:
    """Domain seen in DNS/HTTP/TLS telemetry: check threat intel and recent phishing alerts."""
    if not ev.domain:
        return
    hit = threat_intel.domain_listed(db, ev.domain)
    if hit is not None:
        emit(db, AlertDraft(
            module="intel", category="contact_with_known_malicious_host", severity="high", confidence=0.99,
            source=ev.source, is_simulated=ev.is_simulated, detector="urlhaus", detector_version="feed",
            mitre_technique="T1071.001",
            title=f"{ev.src_ip or ev.host} contacted {ev.domain}, listed in URLhaus ({hit.threat or 'malware'})",
            description="The host appears in the URLhaus malicious URL feed.",
            src_ip=ev.src_ip, dst_ip=ev.dst_ip, host=ev.host,
            evidence={"telemetry_event_id": ev.id, "reference": hit.reference, "tags": hit.tags},
            entities=[("domain", ev.domain)], aggregation_key=f"intel_contact|{ev.domain}|{ev.src_ip}"))
    domain_contact_alert(db, ev)


def _score_http_url(db: Session, ev: TelemetryEvent, url: str) -> None:
    rules = settings_service.load_all(db)["rules"]
    if not rules.get("score_http_urls") or not url:
        return
    from app.core.config import get_settings
    from app.services.rules.hospital import is_external

    s = get_settings()
    # Only browsing to external destinations is scored; internal portals and IP-only hosts are out of scope
    # for a model trained on public phishing/legitimate web URLs.
    if not ev.dst_ip or not is_external(ev.dst_ip, s.csv_list(s.internal_cidrs)):
        return
    from app.services.detection import analyze_url

    try:
        analyze_url(db, url, user=None, source=ev.source, is_simulated=ev.is_simulated, enrich=True)
    except ModelUnavailable:
        pass


def _flow(db: Session, ev: TelemetryEvent, features: dict[str, float], ctx: FlowContext) -> None:
    try:
        res = analyze_flows(db, [features], [ctx], feature_set="portable", source=ev.source,
                            is_simulated=ev.is_simulated)
        ev.summary = {**ev.summary, "model_category": res[0]["category"],
                      "attack_probability": round(res[0]["attack_probability"], 4)}
        db.commit()
    except ModelUnavailable as exc:
        ev.summary = {**ev.summary, "model_error": str(exc)[:200]}
        db.commit()
    flow_policy(db, ctx, source=ev.source, is_simulated=ev.is_simulated)


# ---- Zeek ---------------------------------------------------------------------------------------

def process_zeek(db: Session, log_type: str, rec: dict[str, Any], *, is_simulated: bool = False) -> str:
    if log_type not in ZEEK_SUPPORTED:
        return "ignored"
    src, dst = str(rec.get("id.orig_h", "")), str(rec.get("id.resp_h", ""))
    dport = int(_num(rec.get("id.resp_p"))) or None
    ts = _ts_epoch(rec.get("ts"))
    uid = rec.get("uid", "")
    domain, extra = "", {}
    if log_type == "dns":
        domain = str(rec.get("query", "") or "").lower()
        key = dedup_hash(uid, rec.get("trans_id"), domain, rec.get("ts"))
    elif log_type == "http":
        domain = str(rec.get("host", "") or "").lower().split(":")[0]
        extra = {"method": rec.get("method"), "status_code": rec.get("status_code")}
        key = dedup_hash(uid, rec.get("trans_depth"), rec.get("ts"))
    elif log_type == "ssl":
        domain = str(rec.get("server_name", "") or "").lower()
        key = dedup_hash(uid, rec.get("ts"))
    else:
        key = dedup_hash(uid, rec.get("ts"), log_type)
    if domain in ("-", "(empty)"):
        domain = ""
    if log_type == "conn":
        extra = {"proto": rec.get("proto"), "service": rec.get("service"), "conn_state": rec.get("conn_state"),
                 "orig_bytes": rec.get("orig_bytes"), "resp_bytes": rec.get("resp_bytes")}
    ev = store_event(db, source="zeek", event_type=log_type, dedup_key=key, event_time=ts, is_simulated=is_simulated,
                     src_ip=src, dst_ip=dst, dst_port=dport, domain=domain, summary={"uid": uid, **extra})
    if ev is None:
        return "duplicate"
    if log_type == "conn":
        ctx = FlowContext(src_ip=src, dst_ip=dst, dst_port=dport or 0, event_time=ts,
                          raw_out_bytes=_num(rec.get("orig_bytes")), raw_in_bytes=_num(rec.get("resp_bytes")))
        _flow(db, ev, portable_from_zeek_conn(rec), ctx)
    elif log_type in ("dns", "http", "ssl"):
        observe_domain(db, ev)
        if log_type == "http" and domain:
            _score_http_url(db, ev, f"{domain}{rec.get('uri', '') or ''}")
    elif log_type == "ssh":
        attempts = int(_num(rec.get("auth_attempts")))
        success = str(rec.get("auth_success", "")).upper() in ("T", "TRUE")
        failures = max(attempts - (1 if success else 0), 0)
        user = str(rec.get("user", "") or "") or f"ssh@{dst}"
        for _ in range(min(failures, 1000)):
            auth_event(db, AuthEvent(ts, user, "failure", src, dst, "ssh", "zeek", is_simulated))
        if success:
            auth_event(db, AuthEvent(ts, user, "success", src, dst, "ssh", "zeek", is_simulated))
    return "processed"


# ---- Suricata -----------------------------------------------------------------------------------

SURICATA_SEVERITY = {1: "high", 2: "medium", 3: "low", 4: "info"}


def process_suricata(db: Session, ev_raw: dict[str, Any], *, is_simulated: bool = False) -> str:
    et = str(ev_raw.get("event_type", ""))
    if et not in SURICATA_SUPPORTED:
        return "ignored"
    src, dst = str(ev_raw.get("src_ip", "")), str(ev_raw.get("dest_ip", ""))
    dport = int(_num(ev_raw.get("dest_port"))) or None
    ts = _ts_iso(ev_raw.get("timestamp"))
    domain, summary = "", {"flow_id": ev_raw.get("flow_id"), "proto": ev_raw.get("proto"),
                           "app_proto": ev_raw.get("app_proto")}
    extra_key: Any = ""
    if et == "dns":
        dns = ev_raw.get("dns", {}) or {}
        domain = str(dns.get("rrname", "") or (dns.get("queries") or [{}])[0].get("rrname", "")).lower()
        extra_key = (dns.get("id"), dns.get("type"), domain)
    elif et == "http":
        http = ev_raw.get("http", {}) or {}
        domain = str(http.get("hostname", "")).lower()
        extra_key = (http.get("url"), ev_raw.get("tx_id"))
    elif et == "tls":
        domain = str((ev_raw.get("tls", {}) or {}).get("sni", "")).lower()
    elif et == "alert":
        a = ev_raw.get("alert", {}) or {}
        summary.update({"signature_id": a.get("signature_id"), "signature": a.get("signature"),
                        "category": a.get("category"), "severity": a.get("severity")})
        extra_key = a.get("signature_id")
    key = dedup_hash(ev_raw.get("flow_id"), et, ev_raw.get("timestamp"), extra_key)
    ev = store_event(db, source="suricata", event_type=et, dedup_key=key, event_time=ts, is_simulated=is_simulated,
                     host=str(ev_raw.get("host", "") or ""), src_ip=src, dst_ip=dst, dst_port=dport,
                     domain=domain, summary=summary)
    if ev is None:
        return "duplicate"
    if et == "flow":
        flow = ev_raw.get("flow", {}) or {}
        ctx = FlowContext(src_ip=src, dst_ip=dst, dst_port=dport or 0, event_time=ts,
                          raw_out_bytes=_num(flow.get("bytes_toserver")), raw_in_bytes=_num(flow.get("bytes_toclient")))
        _flow(db, ev, portable_from_suricata_flow(ev_raw), ctx)
    elif et == "alert":
        a = ev_raw.get("alert", {}) or {}
        sev = SURICATA_SEVERITY.get(int(_num(a.get("severity")) or 3), "low")
        emit(db, AlertDraft(
            module="network", category="ids_signature", severity=sev, confidence=1.0, source="suricata",
            is_simulated=is_simulated, detector=f"suricata:sid:{a.get('signature_id')}",
            detector_version=str(a.get("rev", "")), title=f"Suricata: {a.get('signature', 'signature match')}",
            description=f"Signature category: {a.get('category', 'n/a')}. Detection by the Suricata rule set, not the ML model.",
            src_ip=src, dst_ip=dst, evidence={"telemetry_event_id": ev.id, **summary, "dest_port": dport},
            aggregation_key=f"suricata|{a.get('signature_id')}|{src}|{dst}"))
    else:
        observe_domain(db, ev)
        if et == "http" and domain:
            _score_http_url(db, ev, f"{domain}{(ev_raw.get('http') or {}).get('url', '')}")
    return "processed"


# ---- Sysmon / auth ------------------------------------------------------------------------------

def process_sysmon(db: Session, raw: dict[str, Any], *, is_simulated: bool = False) -> str:
    ev = parse_sysmon(raw)
    if ev.event_id not in (1, 3, 11, 22, 23, 26):
        return "ignored"
    key = dedup_hash(ev.host, ev.record_id) if ev.record_id else dedup_hash(sorted(raw.items(), key=str))
    domain = ev.query_name if ev.event_id == 22 else ""
    stored = store_event(db, source="sysmon", event_type=f"sysmon_{ev.event_id}", dedup_key=key,
                         event_time=ev.timestamp, is_simulated=is_simulated, host=ev.host,
                         src_ip=ev.source_ip, dst_ip=ev.destination_ip, dst_port=ev.destination_port,
                         domain=domain, user_name=ev.user,
                         summary={"image": ev.image[-200:], "target": ev.target_filename[-200:]})
    if stored is None:
        return "duplicate"
    endpoint_event(db, ev, is_simulated=is_simulated)
    if domain:
        observe_domain(db, stored)
    return "processed"


def process_auth(db: Session, ev: AuthEvent, dedup_key: str) -> str:
    stored = store_event(db, source="auth", event_type=f"auth_{ev.outcome}", dedup_key=dedup_key,
                         event_time=ev.timestamp, is_simulated=ev.is_simulated, host=ev.host, src_ip=ev.source_ip,
                         user_name=ev.user, summary={"service": ev.service})
    if stored is None:
        return "duplicate"
    auth_event(db, ev)
    return "processed"


_ = registry
