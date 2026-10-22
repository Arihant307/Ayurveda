"""URLhaus (abuse.ch) threat-intelligence enrichment.

The recent-URLs CSV is refreshed on a schedule. abuse.ch requires a free Auth-Key
(https://auth.abuse.ch/) for its downloads; without one, or when the feed cannot be
reached, the feed status says so and URL analysis continues with the ML model only.
Indicators are matched locally: submitted URLs are never sent to abuse.ch.
"""

from __future__ import annotations

import csv
import hashlib
import io
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.db_models import FeedStatus, ThreatIndicator
from ml.preprocessing.url_features import normalize_url, parse_url

log = logging.getLogger("hospital_security.intel")
FEED = "urlhaus"


def _h(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def _status(db: Session) -> FeedStatus:
    st = db.execute(select(FeedStatus).where(FeedStatus.feed == FEED)).scalar_one_or_none()
    if st is None:
        st = FeedStatus(feed=FEED, status="never_run")
        db.add(st)
        db.commit()
    return st


def parse_csv(text: str) -> list[dict[str, str]]:
    lines = [ln for ln in text.splitlines() if ln and not ln.startswith("#")]
    reader = csv.reader(lines)
    rows = []
    for r in reader:
        if len(r) < 8:
            continue
        rows.append({"id": r[0], "dateadded": r[1], "url": r[2], "url_status": r[3], "threat": r[5],
                     "tags": r[6], "link": r[7]})
    return rows


def store_indicators(db: Session, rows: list[dict[str, str]]) -> int:
    now = datetime.now(UTC)
    values = []
    for r in rows:
        try:
            first = datetime.strptime(r["dateadded"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=UTC)
        except ValueError:
            first = None
        norm = normalize_url(r["url"])
        host = parse_url(r["url"]).host
        base = {"feed": FEED, "threat": r["threat"][:80], "tags": r["tags"][:255], "first_seen": first,
                "reference": r["link"][:255], "fetched_at": now}
        values.append({**base, "indicator_type": "url", "value": r["url"][:2048], "value_sha256": _h(norm)})
        if host:
            values.append({**base, "indicator_type": "host", "value": host, "value_sha256": _h(host)})
    if not values:
        return 0
    dialect = db.get_bind().dialect.name
    ins = pg_insert if dialect == "postgresql" else sqlite_insert
    for i in range(0, len(values), 500):
        stmt = ins(ThreatIndicator).values(values[i:i + 500])
        stmt = stmt.on_conflict_do_update(
            index_elements=["feed", "indicator_type", "value_sha256"],
            set_={"fetched_at": stmt.excluded.fetched_at, "threat": stmt.excluded.threat, "tags": stmt.excluded.tags},
        )
        db.execute(stmt)
    db.commit()
    return len(values)


def refresh(db: Session, client: httpx.Client | None = None) -> FeedStatus:
    s = get_settings()
    st = _status(db)
    now = datetime.now(UTC)
    st.last_attempt_at = now
    if not s.urlhaus_enabled:
        st.status, st.last_error = "disabled", "URLHAUS_ENABLED=false"
        db.commit()
        return st
    headers = {"User-Agent": "hospital-security-platform/1.0"}
    if s.urlhaus_auth_key:
        headers["Auth-Key"] = s.urlhaus_auth_key
    own = client is None
    client = client or httpx.Client(timeout=s.http_timeout_seconds, follow_redirects=True)
    try:
        resp = client.get(s.urlhaus_feed_url, headers=headers)
        if resp.status_code == 429:
            retry = int(resp.headers.get("Retry-After", "600") or 600)
            st.status, st.last_error = "rate_limited", f"HTTP 429; retry after {retry}s"
            st.next_attempt_at = now + timedelta(seconds=retry)
        elif resp.status_code in (401, 403):
            st.status = "unauthorized"
            st.last_error = (f"HTTP {resp.status_code}: set URLHAUS_AUTH_KEY (free key from auth.abuse.ch)"
                             if not s.urlhaus_auth_key else f"HTTP {resp.status_code}: Auth-Key rejected")
            st.next_attempt_at = now + timedelta(minutes=s.urlhaus_refresh_minutes)
        elif resp.status_code != 200:
            st.status, st.last_error = "error", f"HTTP {resp.status_code}"
            st.next_attempt_at = now + timedelta(minutes=5)
        else:
            rows = parse_csv(resp.text)
            n = store_indicators(db, rows)
            st.status, st.last_error, st.last_success_at = "ok", "", now
            st.indicators = db.query(ThreatIndicator).filter(ThreatIndicator.feed == FEED).count()
            st.next_attempt_at = now + timedelta(minutes=s.urlhaus_refresh_minutes)
            log.info("urlhaus refreshed", extra={"path": f"{len(rows)} rows, {n} indicators"})
    except httpx.HTTPError as exc:
        # Includes timeouts, DNS failures and proxy refusals.
        st.status, st.last_error = "unavailable", f"{type(exc).__name__}: {exc}"[:500]
        st.next_attempt_at = now + timedelta(minutes=5)
        log.warning("urlhaus unavailable: %s", exc)
    finally:
        if own:
            client.close()
    db.commit()
    return st


def lookup(db: Session, url: str) -> dict[str, Any]:
    st = _status(db)
    norm = normalize_url(url)
    host = parse_url(url).host
    rows = db.execute(select(ThreatIndicator).where(
        ((ThreatIndicator.indicator_type == "url") & (ThreatIndicator.value_sha256 == _h(norm)))
        | ((ThreatIndicator.indicator_type == "host") & (ThreatIndicator.value_sha256 == _h(host)))
    ).limit(5)).scalars().all()
    return {
        "checked": st.status == "ok" or st.indicators > 0,
        "feed": FEED, "feed_status": st.status,
        "feed_last_success_at": st.last_success_at.isoformat() if st.last_success_at else None,
        "matches": [{"type": r.indicator_type, "threat": r.threat, "tags": r.tags, "reference": r.reference,
                     "first_seen": r.first_seen.isoformat() if r.first_seen else None} for r in rows],
    }


def domain_listed(db: Session, host: str) -> ThreatIndicator | None:
    return db.execute(select(ThreatIndicator).where(
        ThreatIndicator.indicator_type == "host", ThreatIndicator.value_sha256 == _h(host.lower()))
    ).scalars().first()
