"""Password hashing, JWT sessions, role checks and sensor API keys."""

from __future__ import annotations

import hmac
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.models.db_models import User

COOKIE_NAME = "hs_session"
ALGORITHM = "HS256"
ROLE_RANK = {"viewer": 0, "analyst": 1, "admin": 2}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {"sub": str(user.id), "role": user.role, "email": user.email, "iat": now,
               "exp": now + timedelta(minutes=s.jwt_expire_minutes)}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])


def _token_from_request(request: Request) -> tuple[str | None, bool]:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip(), False
    cookie = request.cookies.get(COOKIE_NAME)
    return (cookie, True) if cookie else (None, False)


def user_from_token(db: Session, token: str) -> User | None:
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        return None
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        return None
    return user


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token, via_cookie = _token_from_request(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    # Cookie sessions must send a custom header on state-changing requests (CSRF defence in depth
    # on top of SameSite=Strict): browsers will not add it to cross-site form posts.
    if via_cookie and request.method not in ("GET", "HEAD", "OPTIONS") and \
            request.headers.get("x-requested-with") != "XMLHttpRequest":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing X-Requested-With header")
    user = user_from_token(db, token)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    request.state.user = user
    return user


def require_role(minimum: str):
    def dep(user: User = Depends(current_user)) -> User:
        if ROLE_RANK.get(user.role, -1) < ROLE_RANK[minimum]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role '{minimum}' or higher")
        return user

    return dep


@dataclass
class Sensor:
    name: str


def require_sensor_or_analyst(
    request: Request,
    x_api_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Sensor | User:
    """Telemetry ingestion: a sensor API key (X-API-Key) or an analyst/admin session."""
    if x_api_key:
        for key, name in get_settings().ingest_keys.items():
            if hmac.compare_digest(key, x_api_key):
                return Sensor(name)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
    user = current_user(request, db)
    if ROLE_RANK.get(user.role, -1) < ROLE_RANK["analyst"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires role 'analyst' or higher")
    return user
