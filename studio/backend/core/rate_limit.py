"""Simple in-memory rate limiting (per client IP)."""
from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock
from typing import DefaultDict, List

from core.errors import http_error

_lock = Lock()
_buckets: DefaultDict[str, List[float]] = defaultdict(list)


def _prune(key: str, window_seconds: int) -> None:
    cutoff = time.time() - window_seconds
    _buckets[key] = [t for t in _buckets[key] if t > cutoff]


def check_rate_limit(
    key: str,
    *,
    max_attempts: int,
    window_seconds: int,
    message: str = "Too many attempts. Please wait a few minutes and try again.",
) -> None:
    with _lock:
        _prune(key, window_seconds)
        if len(_buckets[key]) >= max_attempts:
            raise http_error(429, message)


def record_attempt(key: str) -> None:
    with _lock:
        _buckets[key].append(time.time())
