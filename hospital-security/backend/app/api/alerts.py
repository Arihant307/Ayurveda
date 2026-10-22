from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.security import current_user, require_role
from app.models.db_models import Alert, Incident, User
from app.models.schemas import AlertOut, AlertPage, AlertStatusUpdate, IncidentOut, IncidentUpdate
from app.services import audit
from app.services.alerts import serialize
from app.services.broadcast import hub
from app.services.correlation import serialize_incident

router = APIRouter(tags=["alerts"])


@router.get("/alerts", response_model=AlertPage)
def list_alerts(
    severity: list[str] = Query(default=[]),
    module: list[str] = Query(default=[]),
    category: str | None = None,
    status: list[str] = Query(default=[]),
    source: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    q: str | None = Query(None, max_length=200),
    include_simulated: bool = True,
    incident_id: int | None = None,
    sort: Literal["newest", "oldest", "severity"] = "newest",
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> AlertPage:
    stmt = select(Alert)
    if severity:
        stmt = stmt.where(Alert.severity.in_(severity))
    if module:
        stmt = stmt.where(Alert.module.in_(module))
    if category:
        stmt = stmt.where(Alert.category == category)
    if status:
        stmt = stmt.where(Alert.status.in_(status))
    if source:
        stmt = stmt.where(Alert.source == source)
    if since:
        stmt = stmt.where(Alert.created_at >= since)
    if until:
        stmt = stmt.where(Alert.created_at <= until)
    if not include_simulated:
        stmt = stmt.where(Alert.is_simulated.is_(False))
    if incident_id is not None:
        stmt = stmt.where(Alert.incident_id == incident_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Alert.title.ilike(like), Alert.src_ip.ilike(like), Alert.dst_ip.ilike(like),
                              Alert.host.ilike(like), Alert.user_name.ilike(like)))
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    if sort == "oldest":
        stmt = stmt.order_by(Alert.created_at.asc())
    elif sort == "severity":
        from sqlalchemy import case

        rank = case({"critical": 4, "high": 3, "medium": 2, "low": 1}, value=Alert.severity, else_=0)
        stmt = stmt.order_by(rank.desc(), Alert.created_at.desc())
    else:
        stmt = stmt.order_by(Alert.id.desc())
    items = db.execute(stmt.options(selectinload(Alert.entities)).limit(limit).offset(offset)).scalars().all()
    return AlertPage(total=total, items=[serialize(a) for a in items])


@router.get("/alerts/{alert_id}", response_model=AlertOut)
def get_alert(alert_id: int, _: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    a = db.get(Alert, alert_id)
    if a is None:
        raise HTTPException(404, "Alert not found")
    return serialize(a)


@router.patch("/alerts/{alert_id}", response_model=AlertOut, summary="Acknowledge, investigate or resolve an alert")
def update_alert(alert_id: int, body: AlertStatusUpdate, request: Request, user: User = Depends(require_role("analyst")),
                 db: Session = Depends(get_db)) -> dict:
    a = db.get(Alert, alert_id)
    if a is None:
        raise HTTPException(404, "Alert not found")
    if body.status in ("resolved", "false_positive") and not body.note.strip():
        raise HTTPException(422, "A resolution note is required when resolving an alert")
    old = a.status
    a.status = body.status
    if body.status == "acknowledged":
        a.acknowledged_by = user.id
    if body.status in ("resolved", "false_positive"):
        a.resolved_by, a.resolved_at, a.resolution_note = user.id, datetime.now(UTC), body.note
        # Mirror analyst verdict to the underlying analysis for FP/FN reporting.
        if a.analysis_id:
            from app.models.db_models import Analysis

            an = db.get(Analysis, a.analysis_id)
            if an is not None and an.feedback_label is None:
                an.feedback_label = "benign" if body.status == "false_positive" else "threat"
    elif body.note:
        a.resolution_note = body.note
    db.commit()
    audit.record(db, "alert.status", user=user, request=request, target_type="alert", target_id=a.id,
                 details={"from": old, "to": body.status, "note": body.note[:500]})
    data = serialize(a)
    hub.publish({"type": "alert.updated", "alert": data})
    return data


@router.get("/incidents", response_model=list[IncidentOut])
def list_incidents(status: list[str] = Query(default=[]), limit: int = Query(50, ge=1, le=200),
                   _: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    stmt = select(Incident).options(selectinload(Incident.alerts)).order_by(Incident.id.desc()).limit(limit)
    if status:
        stmt = stmt.where(Incident.status.in_(status))
    return [serialize_incident(i) for i in db.execute(stmt).scalars()]


@router.get("/incidents/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: int, _: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    i = db.get(Incident, incident_id)
    if i is None:
        raise HTTPException(404, "Incident not found")
    return serialize_incident(i)


@router.patch("/incidents/{incident_id}", response_model=IncidentOut,
              summary="Update incident status. Only an analyst can confirm an incident.")
def update_incident(incident_id: int, body: IncidentUpdate, request: Request,
                    user: User = Depends(require_role("analyst")), db: Session = Depends(get_db)) -> dict:
    i = db.get(Incident, incident_id)
    if i is None:
        raise HTTPException(404, "Incident not found")
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(i, k, v)
    if body.status in ("open", "investigating"):
        i.assigned_to = user.id
    db.commit()
    audit.record(db, "incident.update", user=user, request=request, target_type="incident", target_id=i.id,
                 details={k: (v[:300] if isinstance(v, str) else v) for k, v in changes.items()})
    data = serialize_incident(i)
    hub.publish({"type": "incident.updated", "incident": data})
    return data
