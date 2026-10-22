"""Data-retention enforcement (runs daily and on demand)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models.db_models import Alert, Analysis, AuditLog, TelemetryEvent
from app.services import settings_service


def purge(db: Session) -> dict[str, int]:
    r = settings_service.load_all(db)["retention"]
    now = datetime.now(UTC)
    out = {}
    out["telemetry_events"] = db.execute(delete(TelemetryEvent).where(
        TelemetryEvent.received_at < now - timedelta(days=int(r["events_days"])))).rowcount
    # Only closed alerts are purged; open ones stay until someone handles them.
    out["alerts"] = db.execute(delete(Alert).where(
        Alert.created_at < now - timedelta(days=int(r["alerts_days"])),
        Alert.status.in_(("resolved", "false_positive")))).rowcount
    out["analyses"] = db.execute(delete(Analysis).where(
        Analysis.created_at < now - timedelta(days=int(r["alerts_days"])))).rowcount
    out["audit_logs"] = db.execute(delete(AuditLog).where(
        AuditLog.created_at < now - timedelta(days=int(r["audit_days"])))).rowcount
    db.commit()
    return out
