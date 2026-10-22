"""FastAPI application: `uvicorn app.main:app` from the backend directory. API docs at /docs."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from starlette.concurrency import run_in_threadpool

from app.api import admin, alerts, analyze, auth, ingest, live, metrics
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.middleware import BodySizeLimitMiddleware, RateLimitMiddleware, RequestContextMiddleware, configure_logging
from app.core.security import hash_password
from app.models.db_models import FeedStatus, User
from app.services import retention, threat_intel
from app.services.broadcast import hub
from app.services.inference import registry
from app.services.telemetry.tailer import manager

log = logging.getLogger("hospital_security")
API = "/api/v1"


def run_migrations() -> None:
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
    cfg.attributes["skip_logging"] = True
    command.upgrade(cfg, "head")


def bootstrap_admin() -> None:
    s = get_settings()
    with SessionLocal() as db:
        if db.execute(select(func.count(User.id))).scalar_one() > 0:
            return
        if not s.bootstrap_admin_password:
            log.warning("No users exist. Set BOOTSTRAP_ADMIN_PASSWORD (>=12 chars) to create the first admin, "
                        "or run: python -m app.cli create-user --role admin")
            return
        if len(s.bootstrap_admin_password) < 12:
            raise RuntimeError("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters")
        db.add(User(email=s.bootstrap_admin_email.lower(), full_name="Administrator", role="admin",
                    password_hash=hash_password(s.bootstrap_admin_password)))
        db.commit()
        log.info("bootstrap admin created: %s", s.bootstrap_admin_email)


async def scheduler(stop: asyncio.Event) -> None:
    """URLhaus refresh (respecting backoff) and daily retention."""
    last_retention = None
    while not stop.is_set():
        try:
            with SessionLocal() as db:
                st = db.execute(select(FeedStatus).where(FeedStatus.feed == "urlhaus")).scalar_one_or_none()
                due = st is None or st.next_attempt_at is None or st.next_attempt_at <= datetime.now(UTC)
            if due and get_settings().urlhaus_enabled:
                with SessionLocal() as db:
                    await run_in_threadpool(threat_intel.refresh, db)
            today = datetime.now(UTC).date()
            if last_retention != today:
                with SessionLocal() as db:
                    out = await run_in_threadpool(retention.purge, db)
                log.info("retention applied: %s", out)
                last_retention = today
        except Exception:
            log.exception("scheduler iteration failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=60)
        except TimeoutError:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN201
    s = get_settings()
    configure_logging(s.log_level)
    hub.bind(asyncio.get_running_loop())
    if s.auto_migrate:
        await run_in_threadpool(run_migrations)
    await run_in_threadpool(bootstrap_admin)
    await run_in_threadpool(registry.load_all)
    stop = asyncio.Event()
    task = asyncio.create_task(scheduler(stop)) if s.enable_scheduler else None
    if s.enable_tailers:
        manager.start(s.zeek_log_dir, s.suricata_eve_path, s.sysmon_log_path, s.telemetry_poll_seconds)
    yield
    stop.set()
    if task:
        await task
    manager.stop()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title=s.app_name, version="1.0.0", lifespan=lifespan, docs_url="/docs", redoc_url="/redoc",
        openapi_url="/openapi.json",
        description=("Defensive security platform for hospitals: phishing e-mail and URL classification, "
                     "network-intrusion detection on Zeek/Suricata telemetry, Sysmon endpoint/ransomware rules, "
                     "authentication monitoring and alert correlation. Alerts are detections for human review, "
                     "never confirmed incidents, and the platform takes no automatic blocking action."),
    )
    app.add_middleware(RateLimitMiddleware, per_minute=s.rate_limit_per_minute, login_per_minute=s.login_rate_limit_per_minute)
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=s.max_request_bytes, upload_max_bytes=s.max_upload_bytes,
                       upload_paths=(f"{API}/analyze/email/upload", f"{API}/analyze/network/batch"))
    app.add_middleware(CORSMiddleware, allow_origins=s.csv_list(s.cors_origins), allow_credentials=True,
                       allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                       allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-API-Key", "X-Request-ID"])
    app.add_middleware(RequestContextMiddleware)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()]
        return JSONResponse({"detail": "Invalid request", "errors": errors}, status_code=422)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        if isinstance(exc, HTTPException):
            raise exc
        log.exception("unhandled error", extra={"request_id": getattr(request.state, "request_id", None)})
        return JSONResponse({"detail": "Internal server error",
                             "request_id": getattr(request.state, "request_id", None)}, status_code=500)

    for r in (metrics.router, auth.router, analyze.router, alerts.router, ingest.router, admin.router, live.router):
        app.include_router(r, prefix=API)
    return app


app = create_app()
