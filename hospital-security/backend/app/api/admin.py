from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import current_user, require_role
from app.models.db_models import AuditLog, User
from app.models.schemas import SettingsUpdate
from app.services import audit, retention, settings_service, threat_intel

router = APIRouter(tags=["administration"])

VALIDATORS = {
    "thresholds": lambda v: all(
        isinstance(m, dict) and all((x is None and k == "alert") or (isinstance(x, (int, float)) and 0 <= x <= 1)
                                    for k, x in m.items()) for m in v.values()),
    "retention": lambda v: all((isinstance(x, int) and 1 <= x <= 3650) or isinstance(x, bool) for x in v.values()),
}


@router.get("/settings", summary="Alert thresholds, rule parameters, correlation and retention settings")
def get_settings_(_: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return settings_service.load_all(db)


@router.put("/settings/{key}", summary="Update one settings group (admin)")
def put_settings(key: str, body: SettingsUpdate, request: Request, user: User = Depends(require_role("admin")),
                 db: Session = Depends(get_db)) -> dict[str, Any]:
    defaults = settings_service.defaults()
    if key not in defaults:
        raise HTTPException(404, f"Unknown settings group '{key}'")
    unknown = set(body.value) - set(defaults[key])
    if unknown:
        raise HTTPException(422, f"Unknown keys for '{key}': {sorted(unknown)}")
    check = VALIDATORS.get(key)
    if check and not check(body.value):
        raise HTTPException(422, f"Invalid values for '{key}'")
    result = settings_service.update(db, key, body.value, user.id)
    audit.record(db, "settings.update", user=user, request=request, target_type="settings", target_id=key,
                 details=body.value)
    return result


@router.get("/audit-logs", summary="Security event history and user activity audit trail (admin)")
def audit_logs(action: str | None = None, actor: str | None = None, since: datetime | None = None,
               limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0),
               _: User = Depends(require_role("admin")), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    stmt = select(AuditLog).order_by(AuditLog.id.desc())
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    if actor:
        stmt = stmt.where(AuditLog.actor_email == actor.lower())
    if since:
        stmt = stmt.where(AuditLog.created_at >= since)
    return [{"id": a.id, "created_at": a.created_at.isoformat(), "actor_email": a.actor_email, "action": a.action,
             "target_type": a.target_type, "target_id": a.target_id, "ip_address": a.ip_address,
             "outcome": a.outcome, "details": a.details}
            for a in db.execute(stmt.limit(limit).offset(offset)).scalars()]


@router.post("/threat-intel/refresh", summary="Refresh the URLhaus feed now (admin)")
def refresh_intel(request: Request, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)) -> dict[str, Any]:
    st = threat_intel.refresh(db)
    audit.record(db, "intel.refresh", user=user, request=request, outcome="success" if st.status == "ok" else "failure",
                 details={"status": st.status, "error": st.last_error})
    return {"feed": st.feed, "status": st.status, "indicators": st.indicators, "last_error": st.last_error,
            "last_success_at": st.last_success_at.isoformat() if st.last_success_at else None}


@router.post("/retention/run", summary="Apply data-retention policy now (admin)")
def run_retention(request: Request, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)) -> dict[str, int]:
    out = retention.purge(db)
    audit.record(db, "retention.purge", user=user, request=request, details=out)
    return out
