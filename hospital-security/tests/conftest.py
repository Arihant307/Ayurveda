"""Test configuration: an isolated SQLite database migrated with Alembic, background workers disabled."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "backend")]

_tmp = tempfile.mkdtemp(prefix="hs-tests-")
os.environ.update({
    "ENVIRONMENT": "test",
    # Set TEST_DATABASE_URL to run the suite against PostgreSQL (the database must be empty).
    "DATABASE_URL": os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db"),
    "JWT_SECRET": "test-secret-0123456789abcdef0123456789",
    "BOOTSTRAP_ADMIN_EMAIL": "admin@test.local",
    "BOOTSTRAP_ADMIN_PASSWORD": "Admin-Password-123",
    "ENABLE_SCHEDULER": "false",
    "ENABLE_TAILERS": "false",
    "URLHAUS_ENABLED": "true",
    "URLHAUS_AUTH_KEY": "",
    "INGEST_API_KEYS": "test-sensor:sensor-key-abcdefghijklmnop",
    "RATE_LIMIT_PER_MINUTE": "100000",
    "LOGIN_RATE_LIMIT_PER_MINUTE": "1000",
    "CLINICAL_DEVICE_CIDRS": "10.50.0.0/16",
    "LOG_LEVEL": "WARNING",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

ARTIFACTS = ROOT / "ml" / "artifacts"
MODELS_PRESENT = all((ARTIFACTS / n / "LATEST").exists()
                     for n in ("email_classifier", "url_classifier", "network_cic", "network_portable"))
requires_models = pytest.mark.skipif(not MODELS_PRESENT, reason="trained artifacts missing (run the training scripts)")


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_state():
    from app.core.middleware import limiter
    from app.services.rules.endpoint import endpoint_monitor
    from app.services.rules.hospital import auth_monitor

    limiter.reset()
    auth_monitor.reset()
    endpoint_monitor.reset()
    yield


def _login(client, email: str, password: str) -> dict[str, str]:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    client.cookies.clear()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin_headers(client):
    return _login(client, "admin@test.local", "Admin-Password-123")


@pytest.fixture(scope="session")
def analyst_headers(client, admin_headers):
    r = client.post("/api/v1/users", headers=admin_headers,
                    json={"email": "analyst@test.local", "password": "Analyst-Password-1", "role": "analyst"})
    assert r.status_code in (201, 409), r.text
    return _login(client, "analyst@test.local", "Analyst-Password-1")


@pytest.fixture(scope="session")
def viewer_headers(client, admin_headers):
    r = client.post("/api/v1/users", headers=admin_headers,
                    json={"email": "viewer@test.local", "password": "Viewer-Password-1", "role": "viewer"})
    assert r.status_code in (201, 409), r.text
    return _login(client, "viewer@test.local", "Viewer-Password-1")


@pytest.fixture
def db():
    from app.core.db import SessionLocal

    s = SessionLocal()
    yield s
    s.close()
