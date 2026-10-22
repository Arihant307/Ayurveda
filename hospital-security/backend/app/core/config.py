"""Environment-based configuration. Every value can be set through the environment or .env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]

INSECURE_SECRETS = {"", "change-me", "changeme", "dev-insecure-secret-change-me-before-production"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(PROJECT_ROOT / ".env"), env_file_encoding="utf-8", extra="ignore")

    environment: str = Field("development", description="development | test | production")
    app_name: str = "Hospital Security Operations Platform"
    database_url: str = f"sqlite:///{PROJECT_ROOT / 'backend' / 'hospital_security.db'}"
    # Alternative to DATABASE_URL (used by docker-compose): the URL is built with the password
    # URL-encoded, so characters such as @ : / # in POSTGRES_PASSWORD are safe.
    postgres_host: str = ""
    postgres_port: int = 5432
    postgres_db: str = "hospital_security"
    postgres_user: str = "hospital_security"
    postgres_password: str = ""

    # Authentication
    jwt_secret: str = "dev-insecure-secret-change-me-before-production"
    jwt_expire_minutes: int = 60
    cookie_secure: bool = False
    bootstrap_admin_email: str = "admin@hospital.local"
    bootstrap_admin_password: str = ""
    # Comma separated "name:key" pairs for telemetry sensors, e.g. "zeek-core:abc123,edr-1:def456"
    ingest_api_keys: str = ""

    # Limits
    max_request_bytes: int = 2_000_000
    max_upload_bytes: int = 50_000_000
    max_batch_rows: int = 200_000
    rate_limit_per_minute: int = 240
    login_rate_limit_per_minute: int = 10

    # Models
    artifacts_dir: Path = PROJECT_ROOT / "ml" / "artifacts"
    reports_dir: Path = PROJECT_ROOT / "ml" / "reports"

    # Privacy
    store_raw_email: bool = False
    retention_days_alerts: int = 365
    retention_days_events: int = 30
    retention_days_audit: int = 730

    # Threat intelligence (URLhaus). A free Auth-Key from https://auth.abuse.ch/ is required by abuse.ch.
    urlhaus_enabled: bool = True
    urlhaus_auth_key: str = ""
    urlhaus_feed_url: str = "https://urlhaus.abuse.ch/downloads/csv_recent/"
    urlhaus_refresh_minutes: int = 60
    http_timeout_seconds: float = 15.0

    # Live telemetry (file tailing). Paths are optional; empty = adapter disabled.
    zeek_log_dir: str = ""
    suricata_eve_path: str = ""
    sysmon_log_path: str = ""
    telemetry_poll_seconds: float = 1.0
    telemetry_stale_seconds: int = 300

    # Network context for hospital rules
    internal_cidrs: str = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
    clinical_device_cidrs: str = ""
    allowed_outbound_ports: str = "53,80,123,443,587,993"

    cors_origins: str = "http://localhost:3000"
    auto_migrate: bool = True
    enable_scheduler: bool = True
    enable_tailers: bool = True
    log_level: str = "INFO"

    @field_validator("artifacts_dir", "reports_dir", mode="before")
    @classmethod
    def _path(cls, v: str | Path) -> Path:
        p = Path(v)
        return p if p.is_absolute() else PROJECT_ROOT / p

    @model_validator(mode="after")
    def _production_guard(self) -> "Settings":
        if self.postgres_host:
            from urllib.parse import quote

            self.database_url = (f"postgresql+psycopg://{quote(self.postgres_user, safe='')}:"
                                 f"{quote(self.postgres_password, safe='')}@{self.postgres_host}:"
                                 f"{self.postgres_port}/{quote(self.postgres_db, safe='')}")
        if self.environment == "production":
            if self.jwt_secret in INSECURE_SECRETS or len(self.jwt_secret) < 32:
                raise ValueError("JWT_SECRET must be set to a random value of at least 32 characters in production")
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be true in production (serve over HTTPS)")
        return self

    @property
    def ingest_keys(self) -> dict[str, str]:
        out = {}
        for pair in filter(None, (p.strip() for p in self.ingest_api_keys.split(","))):
            name, _, key = pair.partition(":")
            if key:
                out[key] = name
        return out

    def csv_list(self, value: str) -> list[str]:
        return [v.strip() for v in value.split(",") if v.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
