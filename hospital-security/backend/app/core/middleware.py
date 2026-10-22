"""Structured logging, request IDs, body-size limits, rate limiting and security headers."""

from __future__ import annotations

import json
import logging
import sys
import threading
import time
import uuid
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger("hospital_security")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {"ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"), "level": record.levelname,
                "logger": record.name, "msg": record.getMessage()}
        for key in ("request_id", "method", "path", "status", "duration_ms", "client", "user"):
            if hasattr(record, key):
                data[key] = getattr(record, key)
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(data, default=str)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    logging.getLogger("uvicorn.access").disabled = True


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # noqa: ANN001
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = rid
        t0 = time.perf_counter()
        response = await call_next(request)
        dur = (time.perf_counter() - t0) * 1000
        response.headers["X-Request-ID"] = rid
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = response.headers.get("Cache-Control", "no-store")
        if request.url.path not in ("/api/v1/health",):
            user = getattr(getattr(request.state, "user", None), "email", None)
            log.info("request", extra={"request_id": rid, "method": request.method, "path": request.url.path,
                                       "status": response.status_code, "duration_ms": round(dur, 1),
                                       "client": client_ip(request), "user": user})
        return response


class BodySizeLimitMiddleware:
    """Reject bodies larger than the limit, even when Content-Length is absent (chunked uploads)."""

    def __init__(self, app: ASGIApp, max_bytes: int, upload_max_bytes: int, upload_paths: tuple[str, ...]) -> None:
        self.app, self.max_bytes, self.upload_max, self.upload_paths = app, max_bytes, upload_max_bytes, upload_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = self.upload_max if scope["path"].startswith(self.upload_paths) else self.max_bytes
        headers = dict(scope.get("headers") or [])
        declared = headers.get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            await JSONResponse({"detail": f"Request body exceeds {limit} bytes"}, status_code=413)(scope, receive, send)
            return
        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise _TooLarge(limit)
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _TooLarge as exc:
            await JSONResponse({"detail": f"Request body exceeds {exc.limit} bytes"}, status_code=413)(scope, receive, send)


class _TooLarge(Exception):
    def __init__(self, limit: int) -> None:
        self.limit = limit


class RateLimiter:
    """Sliding-window limiter keyed by client IP (per process; use a shared store behind a load balancer)."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window: float = 60.0) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return False, int(window - (now - q[0])) + 1
            q.append(now)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, per_minute: int, login_per_minute: int) -> None:
        super().__init__(app)
        self.per_minute, self.login_per_minute = per_minute, login_per_minute

    async def dispatch(self, request: Request, call_next) -> Response:  # noqa: ANN001
        path = request.url.path
        if path.startswith("/api/") and path != "/api/v1/health":
            ip = client_ip(request)
            if path == "/api/v1/auth/login":
                ok, retry = limiter.allow(f"login:{ip}", self.login_per_minute)
            elif path.startswith("/api/v1/ingest/"):
                ok, retry = True, 0  # sensors are authenticated and can be high-volume
            else:
                ok, retry = limiter.allow(f"api:{ip}", self.per_minute)
            if not ok:
                return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429,
                                    headers={"Retry-After": str(retry)})
        return await call_next(request)
