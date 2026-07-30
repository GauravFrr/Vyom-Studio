"""Daily API usage status for Settings dashboard."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from dependencies.auth import get_current_user
from services.usage_limiter import UsageLimitsConfig, get_status

router = APIRouter(dependencies=[Depends(get_current_user)])


class UsageStatusRequest(BaseModel):
    enable_api_usage_limits: Optional[bool] = True
    tokenlb_daily_limit: Optional[int] = 15
    nano_daily_limit: Optional[int] = 20
    veo_daily_limit: Optional[int] = 8
    durex_daily_limit: Optional[int] = 10
    tokenlb_max_tokens: Optional[int] = 1800
    tokenlb_api_key: Optional[str] = None
    tokenlb_api_keys: Optional[List[str]] = None


@router.get("/today")
async def usage_today():
    """Today's counts with default limits (no body needed)."""
    return get_status(UsageLimitsConfig())


@router.post("/today")
async def usage_today_with_limits(request: UsageStatusRequest):
    """Today's counts using the user's configured limits from Settings."""
    limits = UsageLimitsConfig(
        enabled=request.enable_api_usage_limits if request.enable_api_usage_limits is not None else True,
        tokenlb_daily_limit=request.tokenlb_daily_limit or 15,
        nano_daily_limit=request.nano_daily_limit or 20,
        veo_daily_limit=request.veo_daily_limit or 8,
        durex_daily_limit=request.durex_daily_limit or 10,
        tokenlb_max_tokens=request.tokenlb_max_tokens or 1800,
    )
    keys: List[str] = []
    if request.tokenlb_api_key and request.tokenlb_api_key.strip():
        keys.append(request.tokenlb_api_key.strip())
    if request.tokenlb_api_keys:
        for k in request.tokenlb_api_keys:
            k = (k or "").strip()
            if k and k not in keys:
                keys.append(k)
    return get_status(limits, tokenlb_api_keys=keys or None)
