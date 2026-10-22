"""Database schema. Migrations live in backend/alembic/versions."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class TZDateTime(TypeDecorator):
    """Timezone-aware UTC datetime that also round-trips through SQLite (which drops tzinfo)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):  # noqa: ANN001
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC) if value is not None else None

    def process_result_value(self, value, dialect):  # noqa: ANN001
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value


ROLES = ("admin", "analyst", "viewer")
SEVERITIES = ("info", "low", "medium", "high", "critical")
ALERT_STATUSES = ("new", "acknowledged", "investigating", "resolved", "false_positive")
INCIDENT_STATUSES = ("open", "investigating", "confirmed", "resolved", "dismissed")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="viewer")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)


class Analysis(Base):
    """One model or rule evaluation of one input. Raw content is not stored unless configured."""

    __tablename__ = "analyses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, index=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)  # email | url | network | endpoint | auth
    source: Mapped[str] = mapped_column(String(40), default="user_submission")
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    model_name: Mapped[str] = mapped_column(String(60))
    model_version: Mapped[str] = mapped_column(String(40))
    input_sha256: Mapped[str] = mapped_column(String(64), index=True)
    input_summary: Mapped[str] = mapped_column(Text, default="")
    predicted_label: Mapped[str] = mapped_column(String(40))
    score: Mapped[float] = mapped_column(Float)
    is_threat: Mapped[bool] = mapped_column(Boolean, index=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    submitted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # Analyst feedback: used to report false positives / negatives.
    feedback_label: Mapped[str | None] = mapped_column(String(20), nullable=True)  # threat | benign


class Incident(Base):
    """A group of correlated alerts. Only an analyst can mark it 'confirmed'."""

    __tablename__ = "incidents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, onupdate=utcnow)
    title: Mapped[str] = mapped_column(String(255))
    severity: Mapped[str] = mapped_column(String(10), index=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    correlation_reason: Mapped[str] = mapped_column(Text, default="")
    shared_entities: Mapped[list] = mapped_column(JSON, default=list)
    modules: Mapped[list] = mapped_column(JSON, default=list)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="incident")


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, index=True)
    occurrences: Mapped[int] = mapped_column(Integer, default=1)
    module: Mapped[str] = mapped_column(String(20), index=True)  # email | url | network | endpoint | auth | intel
    category: Mapped[str] = mapped_column(String(60), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    severity: Mapped[str] = mapped_column(String(10), index=True)
    confidence: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)
    source: Mapped[str] = mapped_column(String(40))
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    detector: Mapped[str] = mapped_column(String(80))           # model or rule id
    detector_version: Mapped[str] = mapped_column(String(40))
    mitre_technique: Mapped[str] = mapped_column(String(20), default="")
    host: Mapped[str] = mapped_column(String(255), default="", index=True)
    src_ip: Mapped[str] = mapped_column(String(64), default="", index=True)
    dst_ip: Mapped[str] = mapped_column(String(64), default="", index=True)
    user_name: Mapped[str] = mapped_column(String(255), default="")
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    aggregation_key: Mapped[str] = mapped_column(String(128), default="", index=True)
    analysis_id: Mapped[int | None] = mapped_column(ForeignKey("analyses.id", ondelete="SET NULL"), nullable=True)
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True, index=True)
    acknowledged_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    resolution_note: Mapped[str] = mapped_column(Text, default="")
    incident: Mapped[Incident | None] = relationship(back_populates="alerts")
    entities: Mapped[list["AlertEntity"]] = relationship(back_populates="alert", cascade="all, delete-orphan")


class AlertEntity(Base):
    """Observable attached to an alert (ip, host, user, domain, url, email_domain) used for correlation."""

    __tablename__ = "alert_entities"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    value: Mapped[str] = mapped_column(String(512))
    alert: Mapped[Alert] = relationship(back_populates="entities")
    __table_args__ = (Index("ix_alert_entities_kind_value", "kind", "value"),)


class TelemetryEvent(Base):
    """Minimal normalised record of an ingested telemetry event (no payloads)."""

    __tablename__ = "telemetry_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    received_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, index=True)
    event_time: Mapped[datetime] = mapped_column(TZDateTime(), index=True)
    source: Mapped[str] = mapped_column(String(20), index=True)       # zeek | suricata | sysmon | auth | replay
    event_type: Mapped[str] = mapped_column(String(40))
    dedup_key: Mapped[str] = mapped_column(String(64))
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    host: Mapped[str] = mapped_column(String(255), default="", index=True)
    src_ip: Mapped[str] = mapped_column(String(64), default="", index=True)
    dst_ip: Mapped[str] = mapped_column(String(64), default="")
    dst_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    domain: Mapped[str] = mapped_column(String(255), default="", index=True)
    user_name: Mapped[str] = mapped_column(String(255), default="")
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    __table_args__ = (UniqueConstraint("source", "dedup_key", name="uq_telemetry_dedup"),)


class IngestSource(Base):
    """Health and file-offset state of a telemetry adapter."""

    __tablename__ = "ingest_sources"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    kind: Mapped[str] = mapped_column(String(20))
    path: Mapped[str] = mapped_column(String(1024), default="")
    status: Mapped[str] = mapped_column(String(20), default="not_configured")
    file_inode: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_offset: Mapped[int] = mapped_column(Integer, default=0)
    events_total: Mapped[int] = mapped_column(Integer, default=0)
    duplicates_total: Mapped[int] = mapped_column(Integer, default=0)
    errors_total: Mapped[int] = mapped_column(Integer, default=0)
    last_event_at: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    last_error: Mapped[str] = mapped_column(Text, default="")
    last_error_at: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, onupdate=utcnow)


class ThreatIndicator(Base):
    __tablename__ = "threat_indicators"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    feed: Mapped[str] = mapped_column(String(40), default="urlhaus")
    indicator_type: Mapped[str] = mapped_column(String(10))  # url | host
    value: Mapped[str] = mapped_column(String(2048))
    value_sha256: Mapped[str] = mapped_column(String(64))
    threat: Mapped[str] = mapped_column(String(80), default="")
    tags: Mapped[str] = mapped_column(String(255), default="")
    first_seen: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    reference: Mapped[str] = mapped_column(String(255), default="")
    fetched_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow)
    __table_args__ = (UniqueConstraint("feed", "indicator_type", "value_sha256", name="uq_indicator"),
                      Index("ix_indicator_lookup", "indicator_type", "value_sha256"))


class FeedStatus(Base):
    __tablename__ = "feed_status"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    feed: Mapped[str] = mapped_column(String(40), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="never_run")
    last_attempt_at: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    indicators: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default="")
    next_attempt_at: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)


class AppSetting(Base):
    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, onupdate=utcnow)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_email: Mapped[str] = mapped_column(String(255), default="")
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_type: Mapped[str] = mapped_column(String(40), default="")
    target_id: Mapped[str] = mapped_column(String(80), default="")
    ip_address: Mapped[str] = mapped_column(String(64), default="")
    outcome: Mapped[str] = mapped_column(String(20), default="success")
    details: Mapped[dict] = mapped_column(JSON, default=dict)
