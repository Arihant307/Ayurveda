from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import current_user
from app.models.db_models import Alert, Analysis, FeedStatus, IngestSource, Incident, TelemetryEvent, User
from app.services.broadcast import hub
from app.services.inference import MODEL_NAMES, registry
from app.services.rules.endpoint import RULESET_VERSION as ENDPOINT_RULES
from app.services.rules.hospital import RULESET_VERSION as HOSPITAL_RULES

router = APIRouter(tags=["metrics"])


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


def freshness(db: Session) -> dict[str, Any]:
    s = get_settings()
    now = datetime.now(UTC)
    sources = []
    for src in db.execute(select(IngestSource).order_by(IngestSource.name)).scalars():
        age = (now - src.last_event_at).total_seconds() if src.last_event_at else None
        sources.append({"name": src.name, "kind": src.kind, "path": src.path, "status": src.status,
                        "events_total": src.events_total, "duplicates_total": src.duplicates_total,
                        "errors_total": src.errors_total, "last_event_at": _iso(src.last_event_at),
                        "seconds_since_last_event": age,
                        "stale": src.status == "connected" and (age is None or age > s.telemetry_stale_seconds),
                        "last_error": src.last_error, "last_error_at": _iso(src.last_error_at)})
    # Events pushed over HTTP (no file tailer) also count as telemetry sources.
    pushed = db.execute(select(TelemetryEvent.source, func.count(), func.max(TelemetryEvent.received_at))
                        .group_by(TelemetryEvent.source)).all()
    feeds = [{"feed": f.feed, "status": f.status, "indicators": f.indicators, "last_success_at": _iso(f.last_success_at),
              "last_attempt_at": _iso(f.last_attempt_at), "last_error": f.last_error,
              "next_attempt_at": _iso(f.next_attempt_at)} for f in db.execute(select(FeedStatus)).scalars()]
    return {"tailers": sources, "configured": {"zeek_log_dir": bool(s.zeek_log_dir), "suricata_eve_path": bool(s.suricata_eve_path),
                                               "sysmon_log_path": bool(s.sysmon_log_path)},
            "received_by_source": [{"source": r[0], "events": r[1], "last_received_at": _iso(r[2])} for r in pushed],
            "feeds": feeds, "live_subscribers": hub.subscriber_count, "stale_after_seconds": s.telemetry_stale_seconds}


@router.get("/metrics", summary="Dashboard overview metrics computed from stored analyses, events and alerts")
def metrics(window: Literal["24h", "7d", "30d"] = "7d", include_simulated: bool = True,
            _: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    now = datetime.now(UTC)
    span = {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30)}[window]
    bucket = timedelta(hours=1) if window == "24h" else timedelta(hours=6) if window == "7d" else timedelta(days=1)
    since = now - span

    def sim(stmt, col):  # noqa: ANN001
        return stmt if include_simulated else stmt.where(col.is_(False))

    analyses_total = db.execute(sim(select(func.count(Analysis.id)), Analysis.is_simulated)).scalar_one()
    telemetry_total = db.execute(sim(select(func.count(TelemetryEvent.id)), TelemetryEvent.is_simulated)).scalar_one()
    by_kind = dict(db.execute(sim(select(Analysis.kind, func.count()).group_by(Analysis.kind), Analysis.is_simulated)).all())
    threats_by_kind = dict(db.execute(sim(select(Analysis.kind, func.count()).where(Analysis.is_threat.is_(True))
                                          .group_by(Analysis.kind), Analysis.is_simulated)).all())
    alerts_q = sim(select(Alert), Alert.is_simulated)
    alerts = db.execute(alerts_q.where(Alert.created_at >= since)).scalars().all()
    all_open = db.execute(sim(select(Alert.severity, func.count()).where(Alert.status.in_(("new", "acknowledged", "investigating")))
                              .group_by(Alert.severity), Alert.is_simulated)).all()
    total_alerts = db.execute(sim(select(func.count(Alert.id)), Alert.is_simulated)).scalar_one()
    total_occ = db.execute(sim(select(func.coalesce(func.sum(Alert.occurrences), 0)), Alert.is_simulated)).scalar_one()

    trend: dict[str, Counter] = defaultdict(Counter)
    n_buckets = int(span / bucket)
    starts = [since + i * bucket for i in range(n_buckets + 1)]
    for a in alerts:
        idx = int((a.created_at - since) / bucket)
        trend[starts[min(idx, n_buckets)].isoformat()][a.severity] += 1
    trend_rows = [{"bucket_start": t.isoformat(), **{s: trend[t.isoformat()].get(s, 0)
                                                    for s in ("critical", "high", "medium", "low", "info")}}
                  for t in starts]

    fb = db.execute(sim(select(Analysis.kind, Analysis.is_threat, Analysis.feedback_label, func.count())
                        .where(Analysis.feedback_label.is_not(None))
                        .group_by(Analysis.kind, Analysis.is_threat, Analysis.feedback_label), Analysis.is_simulated)).all()
    feedback: dict[str, Counter] = defaultdict(Counter)
    for kind, is_threat, label, n in fb:
        outcome = ("true_positive" if is_threat else "false_negative") if label == "threat" else \
                  ("false_positive" if is_threat else "true_negative")
        feedback[kind][outcome] += n

    last_inference = {m["name"]: m["last_inference_at"] for m in registry.status()}
    return {
        "generated_at": now.isoformat(), "window": window, "include_simulated": include_simulated,
        "totals": {
            "events_analyzed": int(analyses_total + telemetry_total), "analyses": int(analyses_total),
            "telemetry_events": int(telemetry_total), "alerts": int(total_alerts), "alert_occurrences": int(total_occ),
            "alerts_in_window": len(alerts),
            "open_by_severity": {s: n for s, n in all_open},
            "open_incidents": db.execute(select(func.count(Incident.id)).where(Incident.status.in_(("open", "investigating")))).scalar_one(),
            "simulated_alerts": db.execute(select(func.count(Alert.id)).where(Alert.is_simulated.is_(True))).scalar_one(),
        },
        "analyses_by_kind": by_kind, "threats_by_kind": threats_by_kind,
        "alerts_by_module": dict(Counter(a.module for a in alerts)),
        "alerts_by_category": dict(Counter(a.category for a in alerts).most_common(15)),
        "alerts_by_source": dict(Counter(a.source for a in alerts)),
        "trend": trend_rows,
        "feedback": {k: dict(v) for k, v in feedback.items()},
        "model_last_inference": last_inference,
        "freshness": freshness(db),
    }


@router.get("/models/status", summary="Loaded models, versions, training provenance and live inference counters")
def models_status(_: User = Depends(current_user)) -> dict[str, Any]:
    return {"models": registry.status(),
            "rulesets": [{"name": "hospital_rules", "version": HOSPITAL_RULES, "kind": "deterministic rules"},
                         {"name": "endpoint_rules", "version": ENDPOINT_RULES, "kind": "deterministic rules",
                          "note": "No ML model for endpoint/ransomware: no suitable labelled public telemetry dataset."}]}


@router.get("/models/{name}/report", summary="Evaluation report produced by the training run")
def model_report(name: str, _: User = Depends(current_user)) -> dict[str, Any]:
    if name not in MODEL_NAMES:
        raise HTTPException(404, "Unknown model")
    path = get_settings().reports_dir / f"{name}.json"
    if not path.exists():
        raise HTTPException(404, f"No report for {name}. Train the model first.")
    report = json.loads(path.read_text())
    m = registry.models[name]
    report["loaded_version"] = m.version
    report["report_matches_loaded_model"] = report.get("metadata", {}).get("version") == m.version
    return report


@router.get("/health", summary="Liveness/readiness: database, models, telemetry and feeds")
def health(db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    models = {m["name"]: {"ready": m["ready"], "version": m["version"]} for m in registry.status()}
    status = "ok" if db_ok and all(m["ready"] for m in models.values()) else "degraded" if db_ok else "down"
    return {"status": status, "time": datetime.now(UTC).isoformat(), "database": "ok" if db_ok else "unavailable",
            "models": models, "environment": get_settings().environment}


@router.get("/telemetry/status", summary="Connection health and freshness of telemetry adapters and feeds")
def telemetry_status(_: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return freshness(db)


@router.get("/analyses", summary="Recent analyses (model outputs). Raw content is not stored by default.")
def analyses(kind: str | None = None, limit: int = Query(50, ge=1, le=200), _: User = Depends(current_user),
             db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    stmt = select(Analysis).order_by(Analysis.id.desc()).limit(limit)
    if kind:
        stmt = stmt.where(Analysis.kind == kind)
    return [{"id": a.id, "created_at": _iso(a.created_at), "kind": a.kind, "source": a.source,
             "is_simulated": a.is_simulated, "model_name": a.model_name, "model_version": a.model_version,
             "predicted_label": a.predicted_label, "score": a.score, "is_threat": a.is_threat,
             "feedback_label": a.feedback_label, "input_summary": a.input_summary, "latency_ms": a.latency_ms}
            for a in db.execute(stmt).scalars()]
