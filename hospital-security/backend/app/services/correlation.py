"""Correlate alerts that share concrete observables (IP, host, user, domain, URL) within a time window.

Correlation never confirms an incident: it groups evidence for an analyst, and the
reason plus the shared observables are stored with the incident.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models.db_models import Alert, AlertEntity, Incident, TelemetryEvent
from app.services import settings_service
from app.services.broadcast import hub

log = logging.getLogger("hospital_security.correlation")

CORRELATABLE = ("ip", "host", "user", "domain", "url", "email_sender_domain")
ACTIVE = ("new", "acknowledged", "investigating")


def _sev_rank(s: str) -> int:
    from app.services.alerts import SEV_RANK

    return SEV_RANK.get(s, 0)


def serialize_incident(i: Incident) -> dict:
    return {"id": i.id, "created_at": i.created_at.isoformat(), "updated_at": i.updated_at.isoformat() if i.updated_at else None,
            "title": i.title, "severity": i.severity, "status": i.status, "correlation_reason": i.correlation_reason,
            "shared_entities": i.shared_entities, "modules": i.modules, "notes": i.notes,
            "alert_ids": [a.id for a in i.alerts]}


def _recompute(incident: Incident) -> None:
    from app.services.alerts import bump, max_severity

    alerts = incident.alerts
    modules = sorted({a.module for a in alerts})
    sev = max_severity(*(a.severity for a in alerts)) if alerts else "low"
    if len(modules) >= 2:
        sev = bump(sev)  # independent detectors agreeing raises confidence
    incident.modules = modules
    incident.severity = sev


def correlate_alert(db: Session, alert: Alert) -> Incident | None:
    cfg = settings_service.load_all(db)["correlation"]
    since = datetime.now(UTC) - timedelta(minutes=float(cfg["window_minutes"]))
    ents = [(e.kind, e.value) for e in alert.entities if e.kind in CORRELATABLE]
    if not ents:
        return None
    conds = [and_(AlertEntity.kind == k, AlertEntity.value == v) for k, v in ents]
    from sqlalchemy import or_

    rows = db.execute(
        select(Alert, AlertEntity.kind, AlertEntity.value).join(AlertEntity)
        .where(or_(*conds), Alert.id != alert.id, Alert.last_seen_at >= since, Alert.status.in_(ACTIVE))
    ).all()
    if not rows:
        return None
    related: dict[int, Alert] = {}
    shared: set[tuple[str, str]] = set()
    for other, kind, value in rows:
        related[other.id] = other
        shared.add((kind, value))
    if len(related) + 1 < int(cfg["min_alerts"]):
        return None

    incident = next((a.incident for a in related.values() if a.incident and a.incident.status in ("open", "investigating")), None)
    created = incident is None
    if created:
        incident = Incident(title="", severity=alert.severity, status="open", shared_entities=[], modules=[])
        db.add(incident)
    members = [alert, *related.values()]
    for a in members:
        if a.incident_id is None or a.incident_id == incident.id:
            a.incident = incident
    known = {(e["kind"], e["value"]) for e in incident.shared_entities or []}
    incident.shared_entities = [{"kind": k, "value": v} for k, v in sorted(known | shared)]
    db.flush()
    _recompute(incident)
    first = incident.shared_entities[0]
    incident.title = f"Correlated {' + '.join(incident.modules)} activity involving {first['kind']} {first['value']}"[:255]
    incident.correlation_reason = (
        f"{len(incident.alerts)} alerts within {cfg['window_minutes']} min share observables: "
        + ", ".join(f"{e['kind']}={e['value']}" for e in incident.shared_entities[:8])
    )
    db.commit()
    db.refresh(incident)
    hub.publish({"type": "incident.created" if created else "incident.updated", "incident": serialize_incident(incident)})
    for a in members:
        hub.publish({"type": "alert.updated", "alert": {"id": a.id, "incident_id": a.incident_id}})
    return incident


def domain_contact_alert(db: Session, event: TelemetryEvent) -> None:
    """A host resolved or connected to a domain that an e-mail/URL/intel alert flagged recently."""
    if not event.domain:
        return
    from app.services.alerts import AlertDraft, emit

    cfg = settings_service.load_all(db)["correlation"]
    since = datetime.now(UTC) - timedelta(minutes=float(cfg["window_minutes"]))
    flagged = db.execute(
        select(Alert).join(AlertEntity)
        .where(AlertEntity.kind == "domain", AlertEntity.value == event.domain.lower(),
               Alert.module.in_(("email", "url", "intel")), Alert.created_at >= since, Alert.status.in_(ACTIVE))
        .order_by(Alert.id.desc()).limit(1)
    ).scalar_one_or_none()
    if flagged is None:
        return
    emit(db, AlertDraft(
        module="network", category="contact_with_flagged_domain",
        title=f"{event.host or event.src_ip} contacted {event.domain}, flagged by {flagged.module} alert #{flagged.id}",
        description="Telemetry shows a host resolving or connecting to a domain that was flagged as malicious "
                    "shortly before. This can indicate a user followed a phishing link.",
        severity=_bumped(flagged.severity), confidence=flagged.confidence, source=event.source,
        is_simulated=event.is_simulated or flagged.is_simulated, detector="correlation.domain_contact",
        detector_version="1.0", mitre_technique="T1204.001", host=event.host, src_ip=event.src_ip,
        dst_ip=event.dst_ip, evidence={"telemetry_event_id": event.id, "event_type": event.event_type,
                                       "flagged_alert_id": flagged.id, "domain": event.domain},
        entities=[("domain", event.domain)],
        aggregation_key=f"domain_contact|{event.domain}|{event.src_ip or event.host}",
    ))


def _bumped(sev: str) -> str:
    from app.services.alerts import bump

    return bump(sev) if _sev_rank(sev) < _sev_rank("critical") else sev
