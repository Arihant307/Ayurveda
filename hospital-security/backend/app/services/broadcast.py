"""In-process fan-out of new/updated alerts to WebSocket and SSE subscribers.

Publishing is thread-safe: detection code runs in worker threads (sync endpoints,
telemetry tailers) and hands messages to the event loop with call_soon_threadsafe.
With several API processes, put a shared broker (e.g. Redis pub/sub) behind this.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

log = logging.getLogger("hospital_security.broadcast")


class Hub:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self.published = 0

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=500)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(q)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def _deliver(self, message: dict[str, Any]) -> None:
        for q in list(self._subscribers):
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                # A slow client loses its oldest message rather than blocking detection.
                try:
                    q.get_nowait()
                    q.put_nowait(message)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    pass

    def publish(self, message: dict[str, Any]) -> None:
        self.published += 1
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is loop:
            self._deliver(message)
        else:
            loop.call_soon_threadsafe(self._deliver, message)


hub = Hub()
