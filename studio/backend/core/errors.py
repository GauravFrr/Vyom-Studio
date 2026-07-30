"""Human-friendly API errors — never leak providers, paths, or stack traces."""
from __future__ import annotations

import logging
import re
from typing import Any, Union

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

DEFAULT_MESSAGES: dict[int, str] = {
    400: "That request wasn't valid. Check your input and try again.",
    401: "Please sign in to continue.",
    403: "You don't have permission to access this.",
    404: "We couldn't find what you were looking for.",
    409: "This already exists or conflicts with something saved.",
    429: "Too many requests. Please wait a moment and try again.",
    502: "Our media service is temporarily unavailable. Try again in a few minutes.",
    504: "This took too long to finish. Please try again.",
    500: "Something went wrong on our side. Please try again.",
}

_SENSITIVE = re.compile(
    r"(veo|veoaifree|kaggle|anthropic|openai|tokenlb|hostinger|google.?genai|"
    r"gemini|claude|nano\.php|durex|sqlalchemy|traceback|exception|\.py\b|"
    r"sqlite|jwt|bcrypt|/storage/|\\\\|ffmpeg|ngrok|admin-ajax)",
    re.I,
)


def safe_detail(detail: Any, status_code: int = 500) -> str:
    """Return a client-safe message."""
    if detail is None:
        return DEFAULT_MESSAGES.get(status_code, DEFAULT_MESSAGES[500])
    text = detail if isinstance(detail, str) else str(detail)
    text = text.strip()
    if not text:
        return DEFAULT_MESSAGES.get(status_code, DEFAULT_MESSAGES[500])
    if _SENSITIVE.search(text) or len(text) > 220:
        return DEFAULT_MESSAGES.get(status_code, DEFAULT_MESSAGES[500])
    return text


def http_error(status_code: int, detail: Any) -> HTTPException:
    return HTTPException(status_code=status_code, detail=safe_detail(detail, status_code))


async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    msg = safe_detail(exc.detail, exc.status_code)
    return JSONResponse(status_code=exc.status_code, content={"success": False, "detail": msg})


async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"success": False, "detail": DEFAULT_MESSAGES[500]},
    )
