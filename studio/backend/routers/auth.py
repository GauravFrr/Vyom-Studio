"""User registration, login, session profile, email verification."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse

from core.errors import http_error
from core.rate_limit import check_rate_limit, record_attempt
from core.security import clear_auth_cookie, set_auth_cookie
from dependencies.auth import get_current_user
from models.database import Project, User
from models.db import get_db
from services.account_validation import (
    validate_display_name,
    validate_password,
    validate_registration_email,
)
from services.auth_service import (
    create_access_token,
    hash_password,
    new_user_id,
    new_verification_token,
    verify_password,
)
from services.email_service import send_verification_email

router = APIRouter()

LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_RATE_LIMIT", "5"))
LOGIN_WINDOW_SECONDS = int(os.getenv("LOGIN_RATE_WINDOW_SECONDS", "900"))
REGISTER_MAX_ATTEMPTS = int(os.getenv("REGISTER_RATE_LIMIT", "3"))
REGISTER_WINDOW_SECONDS = int(os.getenv("REGISTER_RATE_WINDOW_SECONDS", "3600"))
VERIFY_TOKEN_HOURS = int(os.getenv("VERIFY_TOKEN_HOURS", "48"))


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    name: str = Field(..., min_length=1, max_length=120)


class CheckEmailRequest(BaseModel):
    email: EmailStr


class CheckPasswordRequest(BaseModel):
    password: str = Field(..., max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=8, max_length=128)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _require_email_verify() -> bool:
    return os.getenv("REQUIRE_EMAIL_VERIFY", "false").lower() == "true"


def _user_public(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "email_verified": bool(user.email_verified),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _claim_orphan_projects(db: Session, user_id: str) -> None:
    user_count = db.query(User).count()
    if user_count != 1:
        return
    db.query(Project).filter(Project.user_id.is_(None)).update(
        {Project.user_id: user_id},
        synchronize_session=False,
    )
    db.commit()


def _issue_verification(db: Session, user: User) -> None:
    token = new_verification_token()
    user.verification_token = token
    user.verification_expires = datetime.now(timezone.utc) + timedelta(hours=VERIFY_TOKEN_HOURS)
    user.email_verified = False
    db.commit()
    send_verification_email(to_email=user.email, name=user.name, token=token)


def _auth_response(user: User, token: str, extra: dict | None = None) -> JSONResponse:
    content: dict = {"success": True, "user": _user_public(user)}
    if extra:
        content.update(extra)
    resp = JSONResponse(content=content)
    set_auth_cookie(resp, token)
    return resp


@router.post("/register")
async def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    check_rate_limit(
        f"register:{ip}",
        max_attempts=REGISTER_MAX_ATTEMPTS,
        window_seconds=REGISTER_WINDOW_SECONDS,
        message="Too many registration attempts. Please try again later.",
    )

    email = body.email.strip().lower()
    try:
        email = validate_registration_email(email)
        validate_password(body.password)
        display_name = validate_display_name(body.name)
    except ValueError as exc:
        record_attempt(f"register:{ip}")
        raise http_error(400, str(exc)) from exc

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        record_attempt(f"register:{ip}")
        raise http_error(409, "We couldn't create that account. Try a different email or sign in.")

    now = datetime.now(timezone.utc)
    require_verify = _require_email_verify()
    user = User(
        id=new_user_id(),
        email=email,
        name=display_name,
        password_hash=hash_password(body.password),
        is_active=True,
        email_verified=not require_verify,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _claim_orphan_projects(db, user.id)

    if require_verify:
        _issue_verification(db, user)

    token = create_access_token(user_id=user.id, email=user.email)
    record_attempt(f"register:{ip}")
    extra = None
    if require_verify:
        extra = {
            "verification_required": True,
            "message": "Account created. Check your email and click the verification link to unlock generation.",
        }
    return _auth_response(user, token, extra=extra)


@router.post("/check-email")
async def check_email(body: CheckEmailRequest):
    """Live validation for the registration form — format, disposable block, MX."""
    try:
        normalized = validate_registration_email(body.email)
        return {"success": True, "valid": True, "email": normalized}
    except ValueError as exc:
        return {"success": True, "valid": False, "detail": str(exc)}


@router.post("/check-password")
async def check_password(body: CheckPasswordRequest):
    """Live validation for password strength rules."""
    try:
        validate_password(body.password)
        return {"success": True, "valid": True}
    except ValueError as exc:
        return {"success": True, "valid": False, "detail": str(exc)}


@router.post("/login")
async def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    check_rate_limit(
        f"login:{ip}",
        max_attempts=LOGIN_MAX_ATTEMPTS,
        window_seconds=LOGIN_WINDOW_SECONDS,
        message="Too many sign-in attempts. Please wait a few minutes and try again.",
    )

    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(body.password, user.password_hash):
        record_attempt(f"login:{ip}")
        raise http_error(401, "Invalid email or password.")
    if not user.is_active:
        record_attempt(f"login:{ip}")
        raise http_error(403, "This account has been disabled.")

    token = create_access_token(user_id=user.id, email=user.email)
    return _auth_response(user, token)


@router.post("/logout")
async def logout():
    resp = JSONResponse(content={"success": True})
    clear_auth_cookie(resp)
    return resp


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {"success": True, "user": _user_public(current_user)}


@router.post("/verify-email")
async def verify_email(body: VerifyEmailRequest, db: Session = Depends(get_db)):
    token = body.token.strip()
    user = db.query(User).filter(User.verification_token == token).first()
    if not user:
        raise http_error(400, "This verification link is invalid or has already been used.")
    if user.email_verified:
        return {
            "success": True,
            "message": "Email already verified. You can use all features now.",
            "already_verified": True,
        }
    if user.verification_expires:
        exp = user.verification_expires
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            raise http_error(400, "This verification link has expired. Request a new one.")
    user.email_verified = True
    # Keep token so reopening the link is safe (React StrictMode, double-clicks).
    db.commit()
    return {"success": True, "message": "Email verified. You can use all features now."}


@router.post("/resend-verification")
async def resend_verification(body: ResendVerificationRequest, request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    check_rate_limit(
        f"resend:{ip}",
        max_attempts=3,
        window_seconds=3600,
        message="Too many verification emails requested. Try again later.",
    )
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    # Generic success — don't reveal whether email exists.
    if user and not user.email_verified:
        _issue_verification(db, user)
    return {"success": True, "message": "If that account exists and is unverified, we sent a new link."}
