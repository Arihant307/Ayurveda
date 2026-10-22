"""Pydantic request/response schemas (also drive the OpenAPI documentation at /docs)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Severity = Literal["info", "low", "medium", "high", "critical"]
Role = Literal["admin", "analyst", "viewer"]


class ErrorResponse(BaseModel):
    detail: Any


# ---- auth / users -------------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(min_length=1, max_length=256)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str
    role: Role
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class UserCreate(BaseModel):
    email: str = Field(..., max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str = Field("", max_length=255)
    password: str = Field(min_length=12, max_length=256)
    role: Role = "viewer"


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, max_length=255)
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(None, min_length=12, max_length=256)


# ---- analysis -----------------------------------------------------------------------------------
class Indicator(BaseModel):
    code: str
    severity: str
    description: str
    evidence: str = ""


class EmailAnalyzeRequest(BaseModel):
    subject: str = Field("", max_length=2_000)
    body: str = Field(..., min_length=1, max_length=200_000)
    sender: str = Field("", max_length=320, description="From address, e.g. 'IT Desk <it@example.com>'")
    reply_to: str = Field("", max_length=320)


class AnalysisOut(BaseModel):
    analysis_id: int
    kind: str
    model_name: str
    model_version: str
    predicted_label: str
    risk_score: float = Field(description="Model probability of the malicious class, 0-1")
    threshold: float
    is_threat: bool
    severity: Severity | None
    alert_id: int | None
    latency_ms: float
    created_at: datetime


class EmailAnalyzeResponse(AnalysisOut):
    indicators: list[Indicator]
    top_terms: list[dict[str, Any]]
    url_domains: list[str]
    url_count: int
    attachments: list[str]
    raw_content_stored: bool


class UrlAnalyzeRequest(BaseModel):
    url: str = Field(..., min_length=3, max_length=4096)
    enrich: bool = True

    @field_validator("url")
    @classmethod
    def _no_whitespace(cls, v: str) -> str:
        v = v.strip()
        if any(c.isspace() for c in v):
            raise ValueError("URL must not contain whitespace")
        if "." not in v and ":" not in v:
            raise ValueError("Not a URL or host name")
        return v


class UrlAnalyzeResponse(AnalysisOut):
    host: str
    registered_domain: str
    reasons: list[Indicator]
    features: dict[str, float]
    ngram_contributions: list[dict[str, Any]]
    threat_intel: dict[str, Any]
    safety_notice: str = ("The URL was analysed as text only. It was not opened. Do not visit it unless the "
                          "security team has confirmed it is safe.")


class NetworkFlowIn(BaseModel):
    """One flow in the portable feature format (computable from Zeek or Suricata)."""

    dst_port: int = Field(ge=0, le=65535)
    protocol: int = Field(ge=0, le=255, description="IP protocol number: 6=TCP, 17=UDP, 1=ICMP")
    duration_us: float = Field(ge=0, le=1e13)
    fwd_pkts: int = Field(ge=0, le=10**9)
    bwd_pkts: int = Field(ge=0, le=10**9)
    fwd_bytes: float = Field(ge=0, le=1e13)
    bwd_bytes: float = Field(ge=0, le=1e13)
    src_ip: str = Field("", max_length=64)
    dst_ip: str = Field("", max_length=64)


class NetworkAnalyzeRequest(BaseModel):
    flows: list[NetworkFlowIn] = Field(..., min_length=1, max_length=1000)
    raise_alerts: bool = True


class FlowPrediction(BaseModel):
    category: str
    attack_probability: float
    class_probabilities: dict[str, float]
    is_threat: bool
    severity: Severity | None = None
    alert_id: int | None = None


class NetworkAnalyzeResponse(BaseModel):
    model_name: str
    model_version: str
    threshold: float
    predictions: list[FlowPrediction]


class BatchResponse(BaseModel):
    model_name: str
    model_version: str
    feature_set: str
    rows_received: int
    rows_analyzed: int
    rows_rejected: int
    rejected_examples: list[str]
    threshold: float
    category_counts: dict[str, int]
    alerts_created: list[int]
    evaluation: dict[str, Any] | None = Field(None, description="Present when the CSV has a ground-truth Label column")
    sample_predictions: list[dict[str, Any]]
    duration_ms: float


class FeedbackRequest(BaseModel):
    label: Literal["threat", "benign"]


# ---- alerts / incidents -------------------------------------------------------------------------
class AlertOut(BaseModel):
    id: int
    created_at: str
    last_seen_at: str | None
    occurrences: int
    module: str
    category: str
    title: str
    description: str
    severity: Severity
    confidence: float
    status: str
    source: str
    is_simulated: bool
    detector: str
    detector_version: str
    mitre_technique: str
    host: str
    src_ip: str
    dst_ip: str
    user_name: str
    evidence: dict[str, Any]
    incident_id: int | None
    analysis_id: int | None
    resolution_note: str
    resolved_at: str | None
    entities: list[dict[str, str]]


class AlertPage(BaseModel):
    total: int
    items: list[AlertOut]


class AlertStatusUpdate(BaseModel):
    status: Literal["acknowledged", "investigating", "resolved", "false_positive", "new"]
    note: str = Field("", max_length=4000)


class IncidentOut(BaseModel):
    id: int
    created_at: str
    updated_at: str | None
    title: str
    severity: Severity
    status: str
    correlation_reason: str
    shared_entities: list[dict[str, str]]
    modules: list[str]
    notes: str
    alert_ids: list[int]


class IncidentUpdate(BaseModel):
    status: Literal["open", "investigating", "confirmed", "resolved", "dismissed"] | None = None
    notes: str | None = Field(None, max_length=10_000)


# ---- ingestion ----------------------------------------------------------------------------------
class IngestBatch(BaseModel):
    events: list[dict[str, Any]] = Field(..., min_length=1, max_length=5000)
    is_simulated: bool = Field(False, description="Set for replayed or synthetic data; shown as SIMULATED in the UI")


class ZeekBatch(IngestBatch):
    log_type: Literal["conn", "dns", "http", "ssh", "ssl"]


class AuthEventIn(BaseModel):
    timestamp: datetime
    user: str = Field(..., min_length=1, max_length=255)
    outcome: Literal["success", "failure"]
    source_ip: str = Field("", max_length=64)
    host: str = Field("", max_length=255)
    service: str = Field("", max_length=64)
    event_id: str = Field("", max_length=128, description="Upstream event id, used for de-duplication")


class AuthBatch(BaseModel):
    events: list[AuthEventIn] = Field(..., min_length=1, max_length=5000)
    is_simulated: bool = False


class IngestResult(BaseModel):
    received: int
    processed: int
    duplicates: int
    ignored: int
    errors: list[str]


# ---- settings -----------------------------------------------------------------------------------
class SettingsUpdate(BaseModel):
    value: dict[str, Any]
