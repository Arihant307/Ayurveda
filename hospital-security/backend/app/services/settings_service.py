"""Runtime-configurable settings (alert thresholds, rule parameters, retention) stored in the database."""

from __future__ import annotations

import copy
import threading
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.db_models import AppSetting


def defaults() -> dict[str, Any]:
    s = get_settings()
    return {
        # Score thresholds. "alert": null means "use the threshold chosen during training"
        # (lowest threshold with validation false-positive rate <= 1 %, see the model reports).
        "thresholds": {
            "email": {"alert": None, "high": 0.90, "critical": 0.98},
            "url": {"alert": None, "high": 0.90, "critical": 0.98},
            "network": {"alert": None, "high": 0.90, "critical": 0.99},
        },
        "rules": {
            "auth_failure_threshold": 10,
            "auth_failure_window_seconds": 300,
            "auth_distinct_hosts_threshold": 5,
            "offhours_start_hour": 22,
            "offhours_end_hour": 6,
            "privileged_accounts": ["administrator", "admin", "root", "domain admins", "svc_backup"],
            "exfil_bytes_threshold": 100_000_000,
            "exfil_ratio_threshold": 20.0,
            "mass_file_threshold": 100,
            "mass_file_window_seconds": 60,
            "allowed_outbound_ports": [int(p) for p in s.csv_list(s.allowed_outbound_ports)],
            "clinical_device_cidrs": s.csv_list(s.clinical_device_cidrs),
            "score_http_urls": True,
        },
        "correlation": {"window_minutes": 60, "min_alerts": 2},
        "alerting": {"suppression_minutes": 10, "notify_min_severity": "low"},
        "retention": {"alerts_days": s.retention_days_alerts, "events_days": s.retention_days_events,
                      "audit_days": s.retention_days_audit, "store_raw_email": s.store_raw_email},
    }


_cache: dict[str, Any] | None = None
_lock = threading.Lock()


def _merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load_all(db: Session) -> dict[str, Any]:
    global _cache
    with _lock:
        if _cache is None:
            merged = defaults()
            for row in db.query(AppSetting).all():
                if row.key in merged and isinstance(row.value, dict):
                    merged[row.key] = _merge(merged[row.key], row.value)
            _cache = merged
        return copy.deepcopy(_cache)


def update(db: Session, key: str, value: dict[str, Any], user_id: int | None) -> dict[str, Any]:
    global _cache
    if key not in defaults():
        raise KeyError(key)
    row = db.get(AppSetting, key)
    current = row.value if row else {}
    merged = _merge(current, value)
    if row is None:
        db.add(AppSetting(key=key, value=merged, updated_by=user_id))
    else:
        row.value = merged
        row.updated_by = user_id
    db.commit()
    with _lock:
        _cache = None
    return load_all(db)


def invalidate() -> None:
    global _cache
    with _lock:
        _cache = None
