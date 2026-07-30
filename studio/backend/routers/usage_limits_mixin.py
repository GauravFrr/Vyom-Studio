"""Shared Pydantic fields for per-request usage limits (from Settings)."""
from typing import List, Optional

from pydantic import BaseModel


class UsageLimitsMixin(BaseModel):
    enable_api_usage_limits: Optional[bool] = True
    tokenlb_daily_limit: Optional[int] = 15
    nano_daily_limit: Optional[int] = 20
    veo_daily_limit: Optional[int] = 8
    durex_daily_limit: Optional[int] = 10
    tokenlb_max_tokens: Optional[int] = 1800
    tokenlb_credit_saver: Optional[bool] = True
    tokenlb_api_keys: Optional[List[str]] = None
