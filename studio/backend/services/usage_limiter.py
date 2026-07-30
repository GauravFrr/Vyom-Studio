"""
Daily API usage limits — protect free/credit-based keys from burning out.

Counts are stored in ``storage/usage/daily.json`` (UTC date buckets).
Limits are sent per-request from the frontend Settings store so the user
controls caps without restarting the backend.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from storage_paths import ensure_dir

logger = logging.getLogger(__name__)

_USAGE_FILE = ensure_dir("usage") / "daily.json"

PROVIDERS = ("tokenlb", "nano", "veo", "durex", "veo-prompt")

# Env fallbacks when the frontend does not send limits.
_ENV_DEFAULTS = {
    "tokenlb": int(os.getenv("TOKENLB_DAILY_LIMIT", "15")),
    "nano": int(os.getenv("NANO_DAILY_LIMIT", "20")),
    "veo": int(os.getenv("VEO_DAILY_LIMIT", "8")),
    "durex": int(os.getenv("DUREX_DAILY_LIMIT", "10")),
    "veo-prompt": int(os.getenv("VEO_DAILY_LIMIT", "8")),
}


@dataclass
class UsageLimitsConfig:
    enabled: bool = True
    tokenlb_daily_limit: int = 15
    nano_daily_limit: int = 20
    veo_daily_limit: int = 8
    durex_daily_limit: int = 10
    tokenlb_max_tokens: int = 1800

    def limit_for(self, provider: str) -> int:
        key = provider.lower()
        if key in ("veo-prompt", "veo-image"):
            key = "veo"
        mapping = {
            "tokenlb": self.tokenlb_daily_limit,
            "nano": self.nano_daily_limit,
            "veo": self.veo_daily_limit,
            "durex": self.durex_daily_limit,
        }
        val = mapping.get(key)
        if val is not None and val > 0:
            return val
        return _ENV_DEFAULTS.get(key, 9999)

    @classmethod
    def from_request(cls, data: Optional[Dict[str, Any]]) -> "UsageLimitsConfig":
        if not data:
            return cls()
        return cls(
            enabled=bool(data.get("enable_api_usage_limits", True)),
            tokenlb_daily_limit=int(data.get("tokenlb_daily_limit") or 15),
            nano_daily_limit=int(data.get("nano_daily_limit") or 20),
            veo_daily_limit=int(data.get("veo_daily_limit") or 8),
            durex_daily_limit=int(data.get("durex_daily_limit") or 10),
            tokenlb_max_tokens=int(data.get("tokenlb_max_tokens") or 1800),
        )


def _utc_today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _load_store() -> Dict[str, Dict[str, int]]:
    if not _USAGE_FILE.exists():
        return {}
    try:
        with open(_USAGE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("usage store read failed: %s", e)
        return {}


def _save_store(data: Dict[str, Dict[str, int]]) -> None:
    _USAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_USAGE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_today_counts() -> Dict[str, int]:
    store = _load_store()
    return dict(store.get(_utc_today(), {}))


def tokenlb_key_id(api_key: str) -> str:
    """Stable per-key bucket id (last 8 chars — enough to distinguish keys)."""
    k = (api_key or "").strip()
    if len(k) < 8:
        return f"tokenlb_key_{k or 'unknown'}"
    return f"tokenlb_key_{k[-8:]}"


def tokenlb_key_label(api_key: str) -> str:
    k = (api_key or "").strip()
    if len(k) <= 12:
        return "sk-…"
    return f"sk-…{k[-8:]}"


def tokenlb_key_used(api_key: str) -> int:
    return int(get_today_counts().get(tokenlb_key_id(api_key), 0))


def tokenlb_key_remaining(api_key: str, limits: UsageLimitsConfig) -> Optional[int]:
    if not limits.enabled:
        return None
    cap = limits.limit_for("tokenlb")
    if cap <= 0:
        return None
    return max(0, cap - tokenlb_key_used(api_key))


def pick_tokenlb_keys_ordered(api_keys: List[str], limits: UsageLimitsConfig) -> List[str]:
    """Return keys sorted by most remaining daily quota first."""
    unique: List[str] = []
    for k in api_keys:
        k = (k or "").strip()
        if k and k not in unique:
            unique.append(k)
    if not unique:
        return []

    def sort_key(k: str) -> tuple:
        rem = tokenlb_key_remaining(k, limits)
        return (rem if rem is not None else 9999, -tokenlb_key_used(k))

    return sorted(unique, key=sort_key, reverse=True)


def check_tokenlb_pool(api_keys: List[str], limits: UsageLimitsConfig) -> None:
    """Raise 429 if every key in the pool hit its per-key daily cap."""
    keys = pick_tokenlb_keys_ordered(api_keys, limits)
    if not keys:
        raise HTTPException(
            status_code=401,
            detail="No TokenLB API keys configured. Add keys in Settings → API Keys.",
        )
    if not limits.enabled:
        return
    cap = limits.limit_for("tokenlb")
    if cap <= 0:
        return
    if any((tokenlb_key_remaining(k, limits) or 0) > 0 for k in keys):
        return
    used_parts = [f"{tokenlb_key_label(k)} {tokenlb_key_used(k)}/{cap}" for k in keys]
    raise HTTPException(
        status_code=429,
        detail=(
            f"All TokenLB keys reached today's per-key limit ({cap} calls each). "
            f"Usage: {', '.join(used_parts)}. Resets at UTC midnight."
        ),
    )


def record_tokenlb_key_use(api_key: str, amount: int = 1) -> None:
    record_use(tokenlb_key_id(api_key), amount)
    record_use("tokenlb", amount)


def get_status(limits: UsageLimitsConfig, tokenlb_api_keys: Optional[List[str]] = None) -> Dict[str, Any]:
    counts = get_today_counts()
    providers = {}
    for p in ("tokenlb", "nano", "veo", "durex"):
        used = int(counts.get(p, 0))
        cap = limits.limit_for(p) if limits.enabled else 0
        providers[p] = {
            "used": used,
            "limit": cap,
            "remaining": max(0, cap - used) if limits.enabled and cap > 0 else None,
            "percent": round(100 * used / cap, 1) if limits.enabled and cap > 0 else 0,
        }

    key_rows = []
    if tokenlb_api_keys:
        per_cap = limits.limit_for("tokenlb") if limits.enabled else 0
        for k in pick_tokenlb_keys_ordered(tokenlb_api_keys, limits):
            used = tokenlb_key_used(k)
            rem = tokenlb_key_remaining(k, limits)
            key_rows.append({
                "label": tokenlb_key_label(k),
                "used": used,
                "limit": per_cap if limits.enabled else None,
                "remaining": rem,
            })

    return {
        "date_utc": _utc_today(),
        "limits_enabled": limits.enabled,
        "providers": providers,
        "tokenlb_max_tokens": limits.tokenlb_max_tokens,
        "tokenlb_keys": key_rows,
        "tokenlb_per_key_limit": limits.limit_for("tokenlb") if limits.enabled else None,
    }


def check_quota(provider: str, limits: UsageLimitsConfig) -> None:
    """Raise HTTP 429 if today's cap is exhausted (global provider bucket)."""
    if not limits.enabled:
        return
    if provider.startswith("tokenlb_key_"):
        cap = limits.limit_for("tokenlb")
        if cap <= 0:
            return
        used = int(get_today_counts().get(provider, 0))
        if used >= cap:
            raise HTTPException(
                status_code=429,
                detail=f"Daily limit for this TokenLB key reached ({used}/{cap}).",
            )
        return
    cap = limits.limit_for(provider)
    if cap <= 0:
        return
    used = int(get_today_counts().get(provider if provider != "veo-prompt" else "veo", 0))
    if provider == "veo-prompt":
        used = int(get_today_counts().get("veo", 0))
    if used >= cap:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily {provider} limit reached ({used}/{cap}). "
                f"Protecting your API credits — raise the cap in Settings → Usage Limits, "
                f"or wait until tomorrow (UTC)."
            ),
        )


def record_use(provider: str, amount: int = 1) -> None:
    """Increment today's counter after a successful API call."""
    if amount <= 0:
        return
    key = "veo" if provider in ("veo-prompt", "veo-image") else provider
    store = _load_store()
    day = _utc_today()
    bucket = store.setdefault(day, {})
    bucket[key] = int(bucket.get(key, 0)) + amount
    # Prune buckets older than 14 days.
    cutoff = sorted(store.keys())
    if len(cutoff) > 14:
        for old in cutoff[:-14]:
            store.pop(old, None)
    _save_store(store)


def extract_limits_from_body(body: Any) -> UsageLimitsConfig:
    """Build limits config from any Pydantic model that carries limit fields."""
    if body is None:
        return UsageLimitsConfig()
    return UsageLimitsConfig(
        enabled=getattr(body, "enable_api_usage_limits", True),
        tokenlb_daily_limit=getattr(body, "tokenlb_daily_limit", None) or 15,
        nano_daily_limit=getattr(body, "nano_daily_limit", None) or 20,
        veo_daily_limit=getattr(body, "veo_daily_limit", None) or 8,
        durex_daily_limit=getattr(body, "durex_daily_limit", None) or 10,
        tokenlb_max_tokens=getattr(body, "tokenlb_max_tokens", None) or 1800,
    )
