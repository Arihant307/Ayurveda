"""Detection pipeline: validated input -> features -> model/rules -> risk score -> alert -> storage -> broadcast."""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.db_models import Analysis, TelemetryEvent, User
from app.services import settings_service, threat_intel
from app.services.alerts import AlertDraft, bump, emit, severity_from_score, thresholds_for
from app.services.inference import registry, sha256_text
from app.services.rules.endpoint import SysmonEvent, endpoint_monitor
from app.services.rules.hospital import AuthEvent, auth_monitor, evaluate_flow_policy
from ml.preprocessing.email_features import ParsedEmail
from ml.preprocessing.flow_features import CATEGORY_INFO
from ml.preprocessing.url_features import parse_url

log = logging.getLogger("hospital_security.detection")


def _summary_email(p: ParsedEmail, store_raw: bool) -> str:
    sender_domain = p.sender.rsplit("@", 1)[-1] if "@" in p.sender else ""
    if store_raw:
        return json.dumps({"subject": p.subject[:300], "sender": p.sender, "body_preview": p.body[:500]})
    # Data minimisation: only the sender domain and message size are kept.
    return json.dumps({"sender_domain": sender_domain, "subject_chars": len(p.subject), "body_chars": len(p.body)})


def analyze_email(db: Session, parsed: ParsedEmail, *, user: User | None, source: str = "user_submission",
                  is_simulated: bool = False) -> tuple[Analysis, Any]:
    cfg = settings_service.load_all(db)
    r = registry.analyze_email(parsed)
    alert_thr, high, critical = thresholds_for(db, "email", r["threshold"])
    is_threat = r["score"] >= alert_thr
    high_ind = [i for i in r["indicators"] if i["severity"] == "high"]
    analysis = Analysis(
        kind="email", source=source, is_simulated=is_simulated, model_name=r["model"], model_version=r["version"],
        input_sha256=sha256_text(parsed.subject, parsed.body),
        input_summary=_summary_email(parsed, cfg["retention"]["store_raw_email"]),
        predicted_label="malicious" if is_threat else "legitimate", score=r["score"], is_threat=is_threat,
        details={"threshold": alert_thr, "indicators": r["indicators"], "top_terms": r["top_terms"],
                 "url_domains": sorted({parse_url(u).registered_domain for u in r["urls"]})[:30],
                 "url_count": len(r["urls"]), "attachments": [a[:120] for a in parsed.attachments]},
        latency_ms=r["latency_ms"], submitted_by=user.id if user else None,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    alert = None
    sev = severity_from_score(r["score"], alert_thr, high, critical)
    # Strong rule evidence alone (e.g. credential request + link-text mismatch) still raises an alert.
    if sev is None and len(high_ind) >= 2:
        sev = "medium"
    if sev is not None:
        if len(high_ind) >= 2 and sev != "critical":
            sev = bump(sev)
        sender_domain = parsed.sender.rsplit("@", 1)[-1] if "@" in parsed.sender else ""
        domains = analysis.details["url_domains"]
        alert = emit(db, AlertDraft(
            module="email", category="phishing_email", severity=sev, confidence=r["score"], source=source,
            is_simulated=is_simulated, detector=r["model"], detector_version=r["version"], mitre_technique="T1566",
            title=f"Suspicious e-mail{' from ' + sender_domain if sender_domain else ''} (risk {r['score']:.0%})",
            description="; ".join(i["description"] for i in r["indicators"][:4]) or "Text classifier flagged the message.",
            evidence={"analysis_id": analysis.id, "score": r["score"], "threshold": alert_thr,
                      "indicators": r["indicators"], "top_terms": r["top_terms"], "url_domains": domains},
            entities=[("email_sender_domain", sender_domain)] + [("domain", d) for d in domains],
            analysis_id=analysis.id, aggregation_key=f"email|{analysis.input_sha256}",
        ))
    return analysis, alert


def analyze_url(db: Session, url: str, *, user: User | None, source: str = "user_submission",
                is_simulated: bool = False, enrich: bool = True) -> tuple[Analysis, Any, dict[str, Any]]:
    r = registry.analyze_url(url)
    intel = threat_intel.lookup(db, url) if enrich else {"checked": False}
    alert_thr, high, critical = thresholds_for(db, "url", r["threshold"])
    is_threat = r["score"] >= alert_thr or bool(intel.get("matches"))
    analysis = Analysis(
        kind="url", source=source, is_simulated=is_simulated, model_name=r["model"], model_version=r["version"],
        input_sha256=sha256_text(r["normalized"]), input_summary=json.dumps({"host": r["host"]}),
        predicted_label="phishing" if r["score"] >= alert_thr else "legitimate", score=r["score"], is_threat=is_threat,
        details={"threshold": alert_thr, "reasons": r["reasons"], "ngram_contributions": r["ngram_contributions"],
                 "features": r["features"], "intel": intel, "registered_domain": r["registered_domain"]},
        latency_ms=r["latency_ms"], submitted_by=user.id if user else None,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    alert = None
    sev = severity_from_score(r["score"], alert_thr, high, critical)
    if intel.get("matches"):
        sev = "critical" if sev in ("high", "critical") else "high"
    if sev is not None:
        module = "intel" if intel.get("matches") and r["score"] < alert_thr else "url"
        alert = emit(db, AlertDraft(
            module=module, category="malicious_url", severity=sev, confidence=max(r["score"], 0.99 if intel.get("matches") else 0),
            source=source, is_simulated=is_simulated, detector=r["model"] if module == "url" else "urlhaus",
            detector_version=r["version"], mitre_technique="T1566.002",
            title=f"Malicious URL on {r['registered_domain']} (risk {r['score']:.0%})"
                  + (" — listed in URLhaus" if intel.get("matches") else ""),
            description="; ".join(x["description"] for x in r["reasons"][:4]) or "URL model flagged this link.",
            evidence={"analysis_id": analysis.id, "score": r["score"], "threshold": alert_thr, "host": r["host"],
                      "reasons": r["reasons"], "intel": intel, "url_sha256": analysis.input_sha256},
            entities=[("domain", r["registered_domain"]), ("domain", r["host"])],
            analysis_id=analysis.id, aggregation_key=f"url|{analysis.input_sha256}",
        ))
    return analysis, alert, r


# ---- network -----------------------------------------------------------------------------------

@dataclass
class FlowContext:
    src_ip: str = ""
    dst_ip: str = ""
    dst_port: int = 0
    host: str = ""
    event_time: datetime | None = None
    domain: str = ""
    raw_out_bytes: float = 0.0
    raw_in_bytes: float = 0.0


def network_severity(db: Session, category: str, p_attack: float, threshold: float) -> str | None:
    alert_thr, high, critical = thresholds_for(db, "network", threshold)
    sev = severity_from_score(p_attack, alert_thr, high, critical)
    if sev is None:
        return None
    base = CATEGORY_INFO.get(category, {}).get("severity", "medium")
    # A critical category (botnet, DDoS, infiltration) is at least 'high' once it passes the alert threshold.
    if base == "critical" and sev == "medium":
        sev = "high"
    return sev


def analyze_flows(db: Session, rows: list[dict[str, float]], contexts: list[FlowContext], *, feature_set: str,
                  source: str, is_simulated: bool, user: User | None = None, store_analyses: bool = True,
                  raise_alerts: bool = True) -> list[dict[str, Any]]:
    preds, model, ms = registry.analyze_flows(rows, feature_set)
    threshold = float(model.obj.attack_threshold)
    alert_thr, _, _ = thresholds_for(db, "network", threshold)
    results = []
    for pred, ctx, row in zip(preds, contexts, rows):
        # The configured threshold (default: the model's validation-chosen one) decides attack vs benign;
        # the attack category is the most probable non-benign class.
        is_threat = pred["attack_probability"] >= alert_thr
        attack_probs = {k: v for k, v in pred["class_probabilities"].items() if k != "benign"}
        category = max(attack_probs, key=attack_probs.get) if is_threat else "benign"
        out = {**pred, "category": category, "is_threat": is_threat, "alert_id": None, "severity": None}
        if is_threat and (store_analyses or raise_alerts):
            info = CATEGORY_INFO.get(category, {})
            analysis = None
            if store_analyses:
                analysis = Analysis(
                    kind="network", source=source, is_simulated=is_simulated, model_name=model.name,
                    model_version=model.version,
                    input_sha256=hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest(),
                    input_summary=json.dumps({"src_ip": ctx.src_ip, "dst_ip": ctx.dst_ip, "dst_port": ctx.dst_port}),
                    predicted_label=category, score=pred["attack_probability"], is_threat=True,
                    details={"class_probabilities": pred["class_probabilities"], "threshold": alert_thr},
                    latency_ms=ms / max(len(rows), 1), submitted_by=user.id if user else None,
                )
                db.add(analysis)
                db.commit()
                db.refresh(analysis)
            sev = network_severity(db, category, pred["attack_probability"], threshold)
            if raise_alerts and sev:
                where = f"{ctx.src_ip or '?'} -> {ctx.dst_ip or '?'}:{ctx.dst_port or int(row.get('dst_port', row.get('Dst Port', 0)))}"
                alert = emit(db, AlertDraft(
                    module="network", category=category, severity=sev, confidence=pred["attack_probability"],
                    source=source, is_simulated=is_simulated, detector=model.name, detector_version=model.version,
                    mitre_technique=info.get("mitre", ""), title=f"{info.get('title', category)}: {where}",
                    description=f"Flow classifier ({model.meta.get('selected_model')}) on CSE-CIC-IDS2018 "
                                f"categories. P(attack)={pred['attack_probability']:.3f}.",
                    src_ip=ctx.src_ip, dst_ip=ctx.dst_ip, host=ctx.host,
                    evidence={"analysis_id": analysis.id if analysis else None,
                              "class_probabilities": pred["class_probabilities"], "threshold": alert_thr,
                              "features": {k: round(float(v), 3) for k, v in list(row.items())[:20]}},
                    entities=[("domain", ctx.domain)] if ctx.domain else [],
                    analysis_id=analysis.id if analysis else None,
                    aggregation_key=f"net|{category}|{ctx.src_ip}|{ctx.dst_ip}" if ctx.src_ip else "",
                ))
                out["alert_id"], out["severity"] = alert.id, alert.severity
        results.append(out)
    return results


def flow_policy(db: Session, ctx: FlowContext, *, source: str, is_simulated: bool) -> None:
    rules = settings_service.load_all(db)["rules"]
    s = get_settings()
    for draft in evaluate_flow_policy(src_ip=ctx.src_ip, dst_ip=ctx.dst_ip, dst_port=ctx.dst_port,
                                      out_bytes=ctx.raw_out_bytes, in_bytes=ctx.raw_in_bytes, rules=rules,
                                      internal_cidrs=s.csv_list(s.internal_cidrs), source=source,
                                      is_simulated=is_simulated, host=ctx.host, domain=ctx.domain):
        emit(db, draft)


def auth_event(db: Session, ev: AuthEvent) -> list[Any]:
    rules = settings_service.load_all(db)["rules"]
    return [emit(db, d) for d in auth_monitor.evaluate(ev, rules)]


def endpoint_event(db: Session, ev: SysmonEvent, *, source: str = "sysmon", is_simulated: bool = False) -> list[Any]:
    rules = settings_service.load_all(db)["rules"]
    return [emit(db, d) for d in endpoint_monitor.evaluate(ev, rules, source=source, is_simulated=is_simulated)]


# ---- telemetry bookkeeping -----------------------------------------------------------------------

def store_event(db: Session, *, source: str, event_type: str, dedup_key: str, event_time: datetime | None,
                is_simulated: bool = False, host: str = "", src_ip: str = "", dst_ip: str = "",
                dst_port: int | None = None, domain: str = "", user_name: str = "",
                summary: dict[str, Any] | None = None) -> TelemetryEvent | None:
    """Insert a normalised event. Returns None when the event was already ingested (duplicate)."""
    ev = TelemetryEvent(
        source=source, event_type=event_type, dedup_key=dedup_key[:64], event_time=event_time or datetime.now(UTC),
        is_simulated=is_simulated, host=(host or "")[:255], src_ip=src_ip or "", dst_ip=dst_ip or "",
        dst_port=dst_port, domain=(domain or "").lower().rstrip(".")[:255], user_name=(user_name or "")[:255],
        summary=summary or {},
    )
    db.add(ev)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    db.refresh(ev)
    return ev


def dedup_hash(*parts: Any) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()
