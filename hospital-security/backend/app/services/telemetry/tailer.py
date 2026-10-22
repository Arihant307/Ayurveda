"""File tailers for Zeek logs, Suricata eve.json and Sysmon JSON lines.

Each tailer runs in its own thread, remembers its inode and byte offset in the
``ingest_sources`` table (so a restart resumes without re-reading), follows log
rotation, retries with exponential backoff on errors and reports health
(status, last event time, counters, last error) for the dashboard.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.db_models import IngestSource
from app.services.telemetry.processors import ZEEK_SUPPORTED, process_suricata, process_sysmon, process_zeek

log = logging.getLogger("hospital_security.tailer")


def parse_zeek_tsv_header(lines: list[str]) -> tuple[list[str], str, str]:
    fields, sep, unset = [], "\t", "-"
    for ln in lines:
        if ln.startswith("#separator"):
            raw = ln.split(" ", 1)[1].strip()
            sep = raw.encode().decode("unicode_escape")
        elif ln.startswith("#fields"):
            fields = ln.rstrip("\n").split(sep)[1:]
        elif ln.startswith("#unset_field"):
            unset = ln.rstrip("\n").split(sep)[1]
    return fields, sep, unset


def parse_zeek_line(line: str, fields: list[str], sep: str, unset: str) -> dict[str, Any] | None:
    line = line.rstrip("\n")
    if not line or line.startswith("#"):
        return None
    if line.startswith("{"):
        return json.loads(line)
    if not fields:
        raise ValueError("Zeek TSV line before a #fields header")
    values = line.split(sep)
    return {f: (None if v in (unset, "(empty)") else v) for f, v in zip(fields, values)}


class FileTailer(threading.Thread):
    def __init__(self, name: str, kind: str, path: Path, handler: Callable[[str, dict[str, Any] | None], None],
                 poll_seconds: float = 1.0, zeek_log_type: str = "") -> None:
        super().__init__(name=f"tailer-{name}", daemon=True)
        self.source_name, self.kind, self.path = name, kind, path
        self.handler, self.poll = handler, poll_seconds
        self.zeek_log_type = zeek_log_type
        self._stop_event = threading.Event()
        self._fields: list[str] = []
        self._sep, self._unset = "\t", "-"

    def stop(self) -> None:
        self._stop_event.set()

    # -- state ----------------------------------------------------------------------------------
    def _state(self, db) -> IngestSource:  # noqa: ANN001
        src = db.execute(select(IngestSource).where(IngestSource.name == self.source_name)).scalar_one_or_none()
        if src is None:
            src = IngestSource(name=self.source_name, kind=self.kind, path=str(self.path), status="starting")
            db.add(src)
            db.commit()
        if src.path != str(self.path):
            src.path, src.file_offset, src.file_inode = str(self.path), 0, None
            db.commit()
        return src

    def _set(self, **kw: Any) -> None:
        with SessionLocal() as db:
            src = self._state(db)
            for k, v in kw.items():
                setattr(src, k, v)
            db.commit()

    # -- loop -----------------------------------------------------------------------------------
    def run(self) -> None:
        backoff = self.poll
        while not self._stop_event.is_set():
            try:
                read = self._read_once()
                backoff = self.poll
                if not read:
                    self._stop_event.wait(self.poll)
            except Exception as exc:
                log.exception("tailer %s failed", self.source_name)
                with SessionLocal() as db:
                    src = self._state(db)
                    src.status, src.last_error = "error", f"{type(exc).__name__}: {exc}"[:1000]
                    src.last_error_at, src.errors_total = datetime.now(UTC), src.errors_total + 1
                    db.commit()
                self._stop_event.wait(backoff)
                backoff = min(backoff * 2, 60.0)

    def _read_once(self) -> int:
        if not self.path.exists():
            self._set(status="waiting_for_file", last_error=f"{self.path} does not exist yet")
            return 0
        st = os.stat(self.path)
        with SessionLocal() as db:
            src = self._state(db)
            offset, inode = src.file_offset, src.file_inode
            if inode != st.st_ino or st.st_size < offset:  # new file or rotated/truncated
                offset = 0
                src.file_inode, src.file_offset = st.st_ino, 0
            if src.status in ("starting", "waiting_for_file", "error", "not_configured"):
                src.status = "connected"
            db.commit()
        if st.st_size == offset:
            return 0
        processed = dups = errors = 0
        with open(self.path, encoding="utf-8", errors="replace") as f:
            if self.kind == "zeek":
                header = []
                for ln in f:
                    if not ln.startswith("#"):
                        break
                    header.append(ln)
                if header:
                    self._fields, self._sep, self._unset = parse_zeek_tsv_header(header)
            f.seek(offset)
            batch = 0
            while batch < 5000:
                pos = f.tell()
                line = f.readline()
                if not line:
                    break
                if not line.endswith("\n"):
                    f.seek(pos)  # partial line still being written
                    break
                batch += 1
                try:
                    if self.kind == "zeek":
                        if line.startswith("#fields") or line.startswith("#separator"):
                            self._fields, self._sep, self._unset = parse_zeek_tsv_header([line])
                            continue
                        rec = parse_zeek_line(line, self._fields, self._sep, self._unset)
                    else:
                        rec = json.loads(line) if line.strip() else None
                    if rec is None:
                        continue
                    result = self.handler(self.zeek_log_type, rec)
                    processed += result == "processed"
                    dups += result == "duplicate"
                except Exception as exc:  # one bad line must not stop the stream
                    errors += 1
                    log.warning("bad %s line: %s", self.source_name, exc)
            new_offset = f.tell()
        with SessionLocal() as db:
            src = self._state(db)
            src.file_offset = new_offset
            src.events_total += processed
            src.duplicates_total += dups
            src.errors_total += errors
            if processed:
                src.last_event_at = datetime.now(UTC)
            src.status = "connected"
            db.commit()
        return batch


class TelemetryManager:
    """Starts the tailers configured through environment variables."""

    def __init__(self) -> None:
        self.tailers: list[FileTailer] = []

    def start(self, zeek_dir: str, suricata_eve: str, sysmon_path: str, poll: float) -> None:
        def zeek_handler(log_type: str, rec: dict[str, Any] | None) -> str:
            with SessionLocal() as db:
                return process_zeek(db, log_type, rec or {})

        def suricata_handler(_: str, rec: dict[str, Any] | None) -> str:
            with SessionLocal() as db:
                return process_suricata(db, rec or {})

        def sysmon_handler(_: str, rec: dict[str, Any] | None) -> str:
            with SessionLocal() as db:
                return process_sysmon(db, rec or {})

        if zeek_dir:
            for lt in ZEEK_SUPPORTED:
                self.tailers.append(FileTailer(f"zeek-{lt}", "zeek", Path(zeek_dir) / f"{lt}.log", zeek_handler, poll, lt))
        if suricata_eve:
            self.tailers.append(FileTailer("suricata-eve", "suricata", Path(suricata_eve), suricata_handler, poll))
        if sysmon_path:
            self.tailers.append(FileTailer("sysmon", "sysmon", Path(sysmon_path), sysmon_handler, poll))
        for t in self.tailers:
            t.start()
        if self.tailers:
            log.info("telemetry tailers started: %s", ", ".join(t.source_name for t in self.tailers))

    def stop(self) -> None:
        for t in self.tailers:
            t.stop()
        for t in self.tailers:
            t.join(timeout=5)
        self.tailers.clear()


manager = TelemetryManager()
