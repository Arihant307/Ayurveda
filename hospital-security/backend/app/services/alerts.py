"""Alert creation: severity assignment, storm suppression, entity extraction, persistence, broadcast, correlation."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.db_models import SEVERITIES, Alert, AlertEntity
from app.services import settings_service
from app.services.broadcast import hub

log = logging.getLogger("hospital_security.alerts")

SEV_RANK = {s: i for i, s in enumerate(SEVERITIES)}


def max_severity(*sevs: str) -> str:
    return max(sevs, key=lambda s: SEV_RANK.get(s, 0))


def bump(sev: str, levels: int = 1) -> str:
    return SEVERITIES[min(SEV_RANK.get(sev, 0) + levels, len(SEVERITIES) - 1)]


def severity_from_score(score: float, alert_threshold: float, high: float, critical: float) -> str | None:
    """None means below the alert threshold (no alert)."""
    if score < alert_threshold:
        return None
    if score >= critical:
        return "critical"
    if score >= high:
        return "high"
    return "medium"


def thresholds_for(db: Session, module: str, model_threshold: float) -> tuple[float, float, float]:
    t = settings_service.load_all(db)["thresholds"][module]
    alert = t.get("alert")
    alert = float(model_threshold if alert is None else alert)
    high = max(float(t["high"]), alert)
    critical = max(float(t["critical"]), high)
    return alert, high, critical


@dataclass
class AlertDraft:
    module: str
    category: str
    title: str
    severity: str
    confidence: float
    source: str
    detector: str
    detector_version: str
    description: str = ""
    is_simulated: bool = False
    mitre_technique: str = ""
    host: str = ""
    src_ip: str = ""
    dst_ip: str = ""
    user_name: str = ""
    evidence: dict[str, Any] = field(default_factory=dict)
    entities: list[tuple[str, str]] = field(default_factory=list)
    analysis_id: int | None = None
    # Alerts with the same key inside the suppression window are merged (occurrences += 1).
    aggregation_key: str = ""
    event_time: datetime | None = None


def _norm_entities(d: AlertDraft) -> list[tuple[str, str]]:
    ents = set()
    for kind, value in d.entities:
        if value:
            ents.add((kind, str(value).lower()[:512]))
    if d.host:
        ents.add(("host", d.host.lower()))
    if d.src_ip:
        ents.add(("ip", d.src_ip))
    if d.dst_ip:
        ents.add(("ip", d.dst_ip))
    if d.user_name:
        ents.add(("user", d.user_name.lower()))
    return sorted(ents)


def serialize(a: Alert) -> dict[str, Any]:
    return {
        "id": a.id, "created_at": a.created_at.isoformat() if a.created_at else None,
        "last_seen_at": a.last_seen_at.isoformat() if a.last_seen_at else None, "occurrences": a.occurrences,
        "module": a.module, "category": a.category, "title": a.title, "description": a.description,
        "severity": a.severity, "confidence": a.confidence, "status": a.status, "source": a.source,
        "is_simulated": a.is_simulated, "detector": a.detector, "detector_version": a.detector_version,
        "mitre_technique": a.mitre_technique, "host": a.host, "src_ip": a.src_ip, "dst_ip": a.dst_ip,
        "user_name": a.user_name, "evidence": a.evidence, "incident_id": a.incident_id,
        "analysis_id": a.analysis_id, "resolution_note": a.resolution_note,
        "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
        "entities": [{"kind": e.kind, "value": e.value} for e in a.entities],
    }


def emit(db: Session, draft: AlertDraft, correlate: bool = True) -> Alert:
    """Persist (or merge) an alert, broadcast it and run correlation. Commits the session."""
    cfg = settings_service.load_all(db)["alerting"]
    now = datetime.now(UTC)
    key = draft.aggregation_key or hashlib.sha256(
        f"{draft.module}|{draft.category}|{draft.detector}|{draft.src_ip}|{draft.dst_ip}|{draft.host}|{draft.user_name}".encode()
    ).hexdigest()[:40]
    window_start = now - timedelta(minutes=float(cfg["suppression_minutes"]))
    existing = db.execute(
        select(Alert).where(Alert.aggregation_key == key, Alert.last_seen_at >= window_start,
                            Alert.status.in_(("new", "acknowledged", "investigating")))
        .order_by(Alert.id.desc()).limit(1)
    ).scalar_one_or_none()
    if existing is not None:
        existing.occurrences += 1
        existing.last_seen_at = now
        existing.confidence = max(existing.confidence, draft.confidence)
        existing.severity = max_severity(existing.severity, draft.severity)
        samples = existing.evidence.get("recent_samples", [])
        samples = (samples + [draft.evidence])[-5:]
        existing.evidence = {**existing.evidence, "recent_samples": samples}
        db.commit()
        hub.publish({"type": "alert.updated", "alert": serialize(existing)})
        return existing

    alert = Alert(
        module=draft.module, category=draft.category, title=draft.title[:255], description=draft.description,
        severity=draft.severity, confidence=float(draft.confidence), source=draft.source,
        is_simulated=draft.is_simulated, detector=draft.detector, detector_version=draft.detector_version,
        mitre_technique=draft.mitre_technique, host=draft.host[:255], src_ip=draft.src_ip, dst_ip=draft.dst_ip,
        user_name=draft.user_name[:255], evidence=draft.evidence, aggregation_key=key, analysis_id=draft.analysis_id,
        created_at=now, last_seen_at=now,
    )
    alert.entities = [AlertEntity(kind=k, value=v) for k, v in _norm_entities(draft)]
    db.add(alert)
    db.commit()
    db.refresh(alert)
    hub.publish({"type": "alert.created", "alert": serialize(alert)})
    if correlate:
        from app.services.correlation import correlate_alert

        try:
            correlate_alert(db, alert)
        except Exception:  # correlation must never lose the alert itself
            log.exception("correlation failed")
            db.rollback()
    return alert
