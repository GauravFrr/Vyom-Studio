"""FastAPI dependencies — resolve the logged-in user from cookie or Bearer JWT."""
from __future__ import annotations

import os

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from core.errors import http_error
from models.database import User
from models.db import get_db
from services.auth_service import ACCESS_TOKEN_COOKIE, decode_access_token

_bearer = HTTPBearer(auto_error=False)


def _token_from_request(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
) -> str | None:
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials
    return request.cookies.get(ACCESS_TOKEN_COOKIE)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    token = _token_from_request(request, credentials)
    if not token:
        raise http_error(401, "Please sign in to continue.")
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise http_error(401, "Your session expired. Please sign in again.")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise http_error(401, "Account not found or disabled.")
    return user


def get_verified_user(current_user: User = Depends(get_current_user)) -> User:
    """When REQUIRE_EMAIL_VERIFY=true, block unverified accounts from heavy API routes."""
    if os.getenv("REQUIRE_EMAIL_VERIFY", "false").lower() == "true" and not current_user.email_verified:
        raise http_error(
            403,
            "Please verify your email before using this feature. Check your inbox or resend verification.",
        )
    return current_user
