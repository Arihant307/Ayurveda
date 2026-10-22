from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import COOKIE_NAME, create_token, current_user, hash_password, require_role, verify_password
from app.models.db_models import User
from app.models.schemas import LoginRequest, LoginResponse, UserCreate, UserOut, UserUpdate
from app.services import audit

router = APIRouter(tags=["auth"])
_DUMMY_HASH = hash_password("timing-equaliser-not-a-password")


@router.post("/auth/login", response_model=LoginResponse, responses={401: {"description": "Invalid credentials"}})
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.execute(select(User).where(func.lower(User.email) == body.email.strip().lower())).scalar_one_or_none()
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok or not user.is_active:
        audit.record(db, "auth.login", request=request, outcome="failure", actor_email=body.email[:255],
                     details={"reason": "invalid credentials" if not user or not ok else "inactive"})
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    user.last_login_at = datetime.now(UTC)
    token = create_token(user)
    s = get_settings()
    response.set_cookie(COOKIE_NAME, token, httponly=True, secure=s.cookie_secure, samesite="strict",
                        max_age=s.jwt_expire_minutes * 60, path="/")
    audit.record(db, "auth.login", user=user, request=request)
    return LoginResponse(access_token=token, expires_in=s.jwt_expire_minutes * 60, user=UserOut.model_validate(user))


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    audit.record(db, "auth.logout", user=user, request=request)
    response.delete_cookie(COOKIE_NAME, path="/")
    response.status_code = 204
    return response


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> User:
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(_: User = Depends(require_role("admin")), db: Session = Depends(get_db)) -> list[User]:
    return list(db.execute(select(User).order_by(User.id)).scalars())


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, request: Request, admin: User = Depends(require_role("admin")),
                db: Session = Depends(get_db)) -> User:
    if db.execute(select(User).where(func.lower(User.email) == body.email.lower())).scalar_one_or_none():
        raise HTTPException(409, "A user with this e-mail already exists")
    user = User(email=body.email.lower(), full_name=body.full_name, role=body.role,
                password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    audit.record(db, "user.create", user=admin, request=request, target_type="user", target_id=user.id,
                 details={"email": user.email, "role": user.role})
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, request: Request, admin: User = Depends(require_role("admin")),
                db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    if user.id == admin.id and (body.role not in (None, "admin") or body.is_active is False):
        raise HTTPException(400, "You cannot demote or deactivate your own account")
    changes = body.model_dump(exclude_unset=True)
    if "password" in changes:
        user.password_hash = hash_password(changes.pop("password"))
        changes["password"] = "changed"
    for k, v in changes.items():
        if k != "password":
            setattr(user, k, v)
    db.commit()
    audit.record(db, "user.update", user=admin, request=request, target_type="user", target_id=user.id, details=changes)
    return user
