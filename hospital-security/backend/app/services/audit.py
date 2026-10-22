from __future__ import annotations

import logging
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.middleware import client_ip
from app.models.db_models import AuditLog, User

log = logging.getLogger("hospital_security.audit")


def record(db: Session, action: str, *, user: User | None = None, request: Request | None = None,
           target_type: str = "", target_id: str | int = "", outcome: str = "success",
           details: dict[str, Any] | None = None, actor_email: str = "", commit: bool = True) -> None:
    entry = AuditLog(
        actor_id=user.id if user else None,
        actor_email=user.email if user else actor_email,
        action=action, target_type=target_type, target_id=str(target_id),
        ip_address=client_ip(request) if request else "", outcome=outcome, details=details or {},
    )
    db.add(entry)
    if commit:
        db.commit()
    log.info("audit", extra={"user": entry.actor_email, "path": action})
