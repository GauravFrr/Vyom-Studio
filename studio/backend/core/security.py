"""Security helpers — cookies, headers, API gate."""
from __future__ import annotations

import os
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from services.auth_service import ACCESS_TOKEN_COOKIE, decode_access_token

# Paths reachable without a session (exact prefix match).
PUBLIC_API_PREFIXES = (
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/verify-email",
    "/api/auth/resend-verification",
    "/api/auth/check-email",
    "/api/auth/check-password",
)


def cookie_secure() -> bool:
    return os.getenv("COOKIE_SECURE", "false").lower() == "true"


def set_auth_cookie(response: Response, token: str) -> None:
    days = int(os.getenv("JWT_EXPIRE_DAYS", "14"))
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=token,
        httponly=True,
        secure=cookie_secure(),
        samesite=os.getenv("COOKIE_SAMESITE", "lax"),
        max_age=days * 86400,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=ACCESS_TOKEN_COOKIE,
        path="/",
        httponly=True,
        secure=cookie_secure(),
        samesite=os.getenv("COOKIE_SAMESITE", "lax"),
    )


def _token_from_request(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return request.cookies.get(ACCESS_TOKEN_COOKIE)


def is_public_api_path(path: str, query: str) -> bool:
    if any(path.startswith(p) for p in PUBLIC_API_PREFIXES):
        return True
    # Signed media URLs — no session cookie in <img>/<video> tags.
    if path.startswith("/api/storage/assets/") and path.endswith("/file") and "sig=" in query:
        return True
    return False


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        if os.getenv("ENV", "development").lower() == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


class ApiAuthGateMiddleware(BaseHTTPMiddleware):
    """Block unauthenticated access to /api/* except public routes."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        if path.startswith("/api/") and not is_public_api_path(path, request.url.query):
            token = _token_from_request(request)
            if not token or not decode_access_token(token):
                from core.errors import DEFAULT_MESSAGES
                from starlette.responses import JSONResponse

                return JSONResponse(
                    status_code=401,
                    content={"success": False, "detail": DEFAULT_MESSAGES[401]},
                )
        return await call_next(request)
