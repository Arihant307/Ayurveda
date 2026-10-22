"""Live alert stream: WebSocket (/api/v1/ws/alerts) and Server-Sent Events (/api/v1/stream/alerts)."""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import COOKIE_NAME, current_user, user_from_token
from app.models.db_models import User
from app.services.broadcast import hub

router = APIRouter(tags=["live"])


@router.websocket("/ws/alerts")
async def ws_alerts(ws: WebSocket) -> None:
    """Authenticate with ?token=<JWT> or the session cookie. Messages: alert.created, alert.updated, incident.*."""
    # Browsers always send Origin on WebSocket handshakes; refuse cross-site pages (CSWSH).
    origin = ws.headers.get("origin")
    s = get_settings()
    if origin and origin not in s.csv_list(s.cors_origins):
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    token = ws.query_params.get("token") or ws.cookies.get(COOKIE_NAME)
    with SessionLocal() as db:
        user = user_from_token(db, token) if token else None
    if user is None:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await ws.accept()
    q = hub.subscribe()
    await ws.send_json({"type": "hello", "user": user.email})
    try:
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=25)
            except TimeoutError:
                msg = {"type": "ping"}
            await ws.send_json(msg)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        hub.unsubscribe(q)


@router.get("/stream/alerts", summary="Server-Sent Events stream of alert updates")
async def sse_alerts(request: Request, user: User = Depends(current_user)) -> StreamingResponse:
    q = hub.subscribe()

    async def gen():  # noqa: ANN202
        try:
            yield f"event: hello\ndata: {json.dumps({'user': user.email})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"event: {msg.get('type', 'message')}\ndata: {json.dumps(msg, default=str)}\n\n"
                except TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            hub.unsubscribe(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


_ = Session
