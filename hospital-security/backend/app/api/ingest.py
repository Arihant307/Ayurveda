"""Push ingestion for authorised sensors (X-API-Key) or analysts. Use only on systems you are authorised to monitor."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import Sensor, require_sensor_or_analyst
from app.models.db_models import User
from app.models.schemas import AuthBatch, IngestBatch, IngestResult, ZeekBatch
from app.services.detection import dedup_hash
from app.services.rules.hospital import AuthEvent
from app.services.telemetry.processors import process_auth, process_suricata, process_sysmon, process_zeek

router = APIRouter(prefix="/ingest", tags=["ingestion"])


def _run(items, fn) -> IngestResult:  # noqa: ANN001
    res = IngestResult(received=len(items), processed=0, duplicates=0, ignored=0, errors=[])
    for i, item in enumerate(items):
        try:
            out = fn(item)
        except (ValueError, KeyError, TypeError) as exc:
            if len(res.errors) < 20:
                res.errors.append(f"event {i}: {exc}")
            continue
        if out == "processed":
            res.processed += 1
        elif out == "duplicate":
            res.duplicates += 1
        else:
            res.ignored += 1
    return res


@router.post("/zeek", response_model=IngestResult, summary="Zeek JSON log records (conn, dns, http, ssh, ssl)")
def ingest_zeek(body: ZeekBatch, who: Sensor | User = Depends(require_sensor_or_analyst),
                db: Session = Depends(get_db)) -> IngestResult:
    return _run(body.events, lambda e: process_zeek(db, body.log_type, e, is_simulated=body.is_simulated))


@router.post("/suricata", response_model=IngestResult, summary="Suricata EVE JSON events (flow, alert, dns, http, tls)")
def ingest_suricata(body: IngestBatch, who: Sensor | User = Depends(require_sensor_or_analyst),
                    db: Session = Depends(get_db)) -> IngestResult:
    return _run(body.events, lambda e: process_suricata(db, e, is_simulated=body.is_simulated))


@router.post("/sysmon", response_model=IngestResult, summary="Windows Sysmon events (flat JSON or Winlogbeat format)")
def ingest_sysmon(body: IngestBatch, who: Sensor | User = Depends(require_sensor_or_analyst),
                  db: Session = Depends(get_db)) -> IngestResult:
    return _run(body.events, lambda e: process_sysmon(db, e, is_simulated=body.is_simulated))


@router.post("/auth", response_model=IngestResult, summary="Authentication events (EHR, VPN, AD, SSH ...)")
def ingest_auth(body: AuthBatch, who: Sensor | User = Depends(require_sensor_or_analyst),
                db: Session = Depends(get_db)) -> IngestResult:
    def one(e) -> str:  # noqa: ANN001
        key = e.event_id or dedup_hash(e.timestamp.isoformat(), e.user, e.outcome, e.source_ip, e.host, e.service)
        ev = AuthEvent(e.timestamp, e.user, e.outcome, e.source_ip, e.host, e.service, "auth", body.is_simulated)
        return process_auth(db, ev, dedup_hash("auth", key))

    return _run(body.events, one)
