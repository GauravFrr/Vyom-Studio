from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from dependencies.auth import get_verified_user
from services.claude_service import claude_service
from services.gemini_service import gemini_service
from services.tokenlb_service import tokenlb_service
from services.openai_service import openai_service
from services.usage_limiter import (
    UsageLimitsConfig,
    check_quota,
    check_tokenlb_pool,
    extract_limits_from_body,
    record_use,
)
from routers.usage_limits_mixin import UsageLimitsMixin

router = APIRouter(dependencies=[Depends(get_verified_user)])


def _resolve_tokenlb_keys(
    tokenlb_api_key: Optional[str] = None,
    tokenlb_api_keys: Optional[List[str]] = None,
) -> List[str]:
    """Merge primary key, extra keys from Settings, and env — deduped, order preserved."""
    import os

    keys: List[str] = []
    for raw in (tokenlb_api_key,):
        k = (raw or "").strip()
        if k and k not in keys:
            keys.append(k)
    if tokenlb_api_keys:
        for raw in tokenlb_api_keys:
            k = (raw or "").strip()
            if k and k not in keys:
                keys.append(k)
    env = (os.getenv("TOKENLB_API_KEY") or "").strip()
    if env and env not in keys:
        keys.append(env)
    return keys


# ---------------------------------------------------------------- provider picker
#
# The story endpoints can run on either Claude or Gemini. Selection rules:
#   1. If `provider` is explicitly set in the request, honour it.
#   2. Else, prefer the key that's actually supplied in the body
#      (anthropic_api_key > google_api_key).
#   3. Else, fall back to whatever the env has configured.
#
# When BOTH providers are available and no explicit override is given, we
# default to **Gemini** — it has a generous free tier, while Claude requires
# a payment method. Users with a paid Claude key can still force it via
# the `provider: "claude"` field (or the "Story pipeline" → default
# provider setting in the UI).
#
# Returns the (service, key) tuple to pass to the matching method. The
# caller does the same call on either backend — output shapes are
# identical (the contract is enforced by claude_service / gemini_service).
def _pick_text_service(
    anthropic_api_key: Optional[str],
    google_api_key: Optional[str],
    tokenlb_api_key: Optional[str] = None,
    provider: Optional[str] = None,
    tokenlb_api_keys: Optional[List[str]] = None,
):
    import os
    has_claude = bool(anthropic_api_key) or bool(os.getenv("ANTHROPIC_API_KEY"))
    has_gemini = bool(google_api_key) or bool(os.getenv("GOOGLE_API_KEY"))
    resolved_tokenlb = _resolve_tokenlb_keys(tokenlb_api_key, tokenlb_api_keys)
    has_tokenlb = bool(resolved_tokenlb)

    if provider == "tokenlb":
        return tokenlb_service, resolved_tokenlb[0] if resolved_tokenlb else None, "tokenlb"
    if provider == "claude":
        return claude_service, anthropic_api_key, "claude"
    if provider == "gemini":
        return gemini_service, google_api_key, "gemini"

    # Body keys win over env when only one is present.
    if resolved_tokenlb and not google_api_key and not anthropic_api_key:
        return tokenlb_service, resolved_tokenlb[0], "tokenlb"
    if anthropic_api_key and not google_api_key and not resolved_tokenlb:
        return claude_service, anthropic_api_key, "claude"
    if google_api_key and not anthropic_api_key and not resolved_tokenlb:
        return gemini_service, google_api_key, "gemini"

    # Auto — prefer TokenLB (free credits), then Gemini, then Claude.
    if has_tokenlb:
        return tokenlb_service, resolved_tokenlb[0], "tokenlb"
    if has_gemini:
        return gemini_service, google_api_key or os.getenv("GOOGLE_API_KEY"), "gemini"
    if has_claude:
        return claude_service, anthropic_api_key or os.getenv("ANTHROPIC_API_KEY"), "claude"

    return tokenlb_service, None, "tokenlb"


# Returns the *other* provider's (service, key) tuple. Used by the
# resilient fallback below. Returns (None, None) if the alternative
# isn't configured.
def _other_provider(
    anthropic_api_key: Optional[str],
    google_api_key: Optional[str],
    current: str,
    tokenlb_api_key: Optional[str] = None,
    tokenlb_api_keys: Optional[List[str]] = None,
):
    import os
    chain = ("tokenlb", "gemini", "claude")
    try:
        idx = chain.index(current)
    except ValueError:
        return None, None, None
    resolved_tokenlb = _resolve_tokenlb_keys(tokenlb_api_key, tokenlb_api_keys)
    for name in chain[idx + 1 :]:
        if name == "tokenlb":
            if resolved_tokenlb:
                return tokenlb_service, resolved_tokenlb[0], "tokenlb"
        if name == "gemini":
            key = google_api_key or os.getenv("GOOGLE_API_KEY")
            if key:
                return gemini_service, key, "gemini"
        if name == "claude":
            key = anthropic_api_key or os.getenv("ANTHROPIC_API_KEY")
            if key:
                return claude_service, key, "claude"
    return None, None, None

# Backwards-compat alias for the old name.
_pick_other = _other_provider




# ----------------------------------------------------------------- error helper

class _ProviderError(Exception):
    """Internal: a provider call failed in a way the router can act on.

    Carries the original message, a "category" (auth / credits / quota /
    other), and the service that produced it. The router catches this and
    decides whether to retry on the other provider or surface a final
    HTTPException to the client.
    """
    def __init__(self, message: str, category: str, provider: str):
        super().__init__(message)
        self.message = message
        self.category = category    # "auth" | "credits" | "quota" | "other"
        self.provider = provider    # "claude" | "gemini"


def _is_credits_or_quota_message(msg: str) -> bool:
    """Detect "the key is fine but the account has no credits" signals.

    These are distinct from "the key itself is wrong" (auth/401). When we
    see one, we should silently fall back to the other provider rather
    than failing the request — the user's request is perfectly valid,
    it's the *billing* that broke. Anthropic returns this as 401 with
    a CreditsError body; Google returns it as 429 RESOURCE_EXHAUSTED.
    """
    if not msg:
        return False
    l = msg.lower()
    needles = (
        # Anthropic / Claude (also catches variants in the wrapped message)
        "creditserror",
        "credit error",
        "no payment method",
        "no payment",
        "add a payment method",
        "add a credit card",
        "billing",
        "plan does not include",
        "upgrade your plan",
        "your account does not have",
        "insufficient credit",
        # Gemini / Google
        "resource_exhausted",
        "resource exhausted",
        "quota exceeded",
        "quotaexceeded",
        "rate limit",
        "rate_limit",
        "free tier",
        "billing not enabled",
    )
    return any(n in l for n in needles)


def _classify_for_fallback(e: Exception, provider: str) -> _ProviderError:
    """Convert a raw exception into a `_ProviderError` the router can act on.

    Order of checks:
      1. Live google-genai APIError — read `.code` and `.message` directly.
      2. FastAPI HTTPException (our own re-wrap) — read the detail string.
      3. Anything else — generic "other" with the str(e).
    """
    from google.genai.errors import APIError as GenaiAPIError

    # 1. Gemini's live exception — code is the HTTP status (int).
    if isinstance(e, GenaiAPIError):
        code = getattr(e, "code", 500) or 500
        msg = str(e) or f"Gemini error code {code}"
        if _is_credits_or_quota_message(msg):
            return _ProviderError(msg, "credits" if code in (400, 401, 402, 403) else "quota", provider)
        if code in (401, 403):
            return _ProviderError(msg, "auth", provider)
        return _ProviderError(msg, "other", provider)

    # 2. Our own re-wrap from a service.
    if isinstance(e, HTTPException):
        msg = str(e.detail) if hasattr(e, "detail") else str(e)
        if _is_credits_or_quota_message(msg):
            return _ProviderError(msg, "credits", provider)
        l = msg.lower()
        if (
            "error code: 401" in l or "error code: 403" in l
            or "invalid api key" in l or "authentication" in l
            or "api key not valid" in l or "permission_denied" in l
        ):
            return _ProviderError(msg, "auth", provider)
        # Some Claude errors come back as 400 with "creditserror" — we
        # already caught those in _is_credits_or_quota_message.
        return _ProviderError(msg, "other", provider)

    # 3. Bare exception (programming error or unexpected SDK shape).
    return _ProviderError(str(e), "other", provider)


def _raise_for_text_error(e: Exception, action: str) -> None:
    """Convert a `_ProviderError` (or raw exception) into an HTTPException.

    This is the LAST line of defence — by the time we get here, the
    endpoint has already tried both providers and at least one failed
    with a non-retryable category. Raise an HTTPException with the
    appropriate status code (401 for auth, 402 for credits, 429 for
    quota, 500 for other).
    """
    if isinstance(e, _ProviderError):
        # Re-wrap so the client gets a useful detail string.
        if e.category == "auth":
            raise HTTPException(status_code=401, detail=f"{action}: {e.message}") from None
        if e.category == "credits":
            raise HTTPException(
                status_code=402,
                detail=(
                    f"{action}: {e.provider.capitalize()} account has no credits / no payment method. "
                    f"Add billing at the provider, or switch the default provider to Gemini. ({e.message})"
                ),
            ) from None
        if e.category == "quota":
            raise HTTPException(
                status_code=429,
                detail=f"{action}: rate-limited on {e.provider}. ({e.message})",
            ) from None
        raise HTTPException(status_code=500, detail=f"{action}: {e.message}") from None

    # Legacy path — a raw exception leaked through (shouldn't happen now
    # that every endpoint uses _call_with_fallback, but keep it as a
    # safety net for future additions).
    from google.genai.errors import APIError as GenaiAPIError
    if isinstance(e, GenaiAPIError):
        code = getattr(e, "code", 500) or 500
        msg = str(e)
        if code in (401, 402, 403):
            raise HTTPException(status_code=401, detail=f"{action}: {msg}") from None
        raise HTTPException(status_code=500, detail=f"{action}: {msg}") from None
    if isinstance(e, HTTPException):
        raise e
    raise HTTPException(status_code=500, detail=f"{action}: {e}")


# ---------------------------------------------------------------- fallback wrapper
async def _call_with_fallback(
    primary_service,
    primary_key: Optional[str],
    primary_name: str,
    other_service,
    other_key: Optional[str],
    other_name: str,
    call,  # async callable taking (service, key) -> result
    action: str,
    limits: Optional[UsageLimitsConfig] = None,
    tokenlb_api_keys: Optional[List[str]] = None,
):
    """Run `call(service, key)`. On a credits/quota error, retry on the other provider.

    Returns ``(result, provider_name, fallback_used)``. If both providers
    fail, the last failure is re-raised as an HTTPException by
    `_raise_for_text_error` (with a 401/402/429/500 status that
    matches the failure category).

    Auth-class errors (401 invalid key, 403 permission denied) are NOT
    retried — the other provider won't help if the user gave us a bad
    key. Only credits/quota errors trigger the retry, because those are
    *account* problems on the primary provider, and the other provider
    might be perfectly happy to serve the request.
    """
    limits = limits or UsageLimitsConfig()
    pool_keys = [k for k in (tokenlb_api_keys or []) if k and str(k).strip()]

    def _guard(svc: Any) -> None:
        name = _quota_name(svc)
        if name == "tokenlb":
            if pool_keys:
                check_tokenlb_pool(pool_keys, limits)
            else:
                check_quota(name, limits)
            return
        if name:
            check_quota(name, limits)

    def _track(svc: Any) -> None:
        name = _quota_name(svc)
        if name == "tokenlb":
            return
        if name:
            record_use(name)

    try:
        _guard(primary_service)
        result = await call(primary_service, primary_key)
        _track(primary_service)
        return result, primary_name, False
    except HTTPException:
        raise
    except Exception as e:
        primary_err = _classify_for_fallback(e, primary_name)
        # Only fall back on credits / quota. Auth = the key is bad, retry
        # would just hit the same wall.
        if primary_err.category not in ("credits", "quota"):
            _raise_for_text_error(primary_err, action)
        if other_service is None or not other_key:
            # No alternative configured — surface the original failure.
            _raise_for_text_error(primary_err, action)
        # Retry on the other provider.
        try:
            _guard(other_service)
            result = await call(other_service, other_key)
            _track(other_service)
            return result, other_name, True
        except HTTPException:
            raise
        except Exception as e2:
            # Other provider also failed — raise the *secondary* error if
            # it's more informative, otherwise the primary.
            other_err = _classify_for_fallback(e2, other_name)
            _raise_for_text_error(other_err, action)


# ---------------------------------------------------------------- request models
#
# Every request model accepts optional `anthropic_api_key` and `google_api_key`
# fields. When supplied, they override the .env-configured key for that one
# call — so users can enter their keys in Settings (which persists to
# localStorage) and have them work without restarting the backend.
#
# Sending keys per-request also keeps them out of process state, so a stale
# key from another browser tab can't leak into someone else's session.
class _BaseKeyed(UsageLimitsMixin):
    anthropic_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    tokenlb_api_key: Optional[str] = None
    tokenlb_api_keys: Optional[List[str]] = None
    tokenlb_base_url: Optional[str] = None
    tokenlb_model: Optional[str] = None
    # Explicit provider override. "tokenlb" | "claude" | "gemini" | None (auto).
    # If unset, the router picks the service based on which key was supplied
    # in this request (or in the env, as a fallback).
    provider: Optional[str] = None
    # ----- Story-style context (optional) -----
    # A reference story in the user's preferred style. The model uses it to
    # match tone, sentence length, vocabulary, and pacing. If empty, the
    # service falls back to its own style instructions.
    sample_story: Optional[str] = None
    # Free-form style notes (formula, rules, ending pattern, etc.). Injected
    # into the system prompt as a STYLE block.
    style_notes: Optional[str] = None
    # Language override, e.g. "hindi", "english". Overrides the per-endpoint
    # `language` field when set.
    story_language: Optional[str] = None
    # Rolling memory: short summaries of the user's most recent projects.
    # Helps the model stay consistent across sessions ("the kind of stories
    # I usually make is…"). Capped to a small list server-side.
    memory_summaries: Optional[List[str]] = None
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = None
    gemini_model: Optional[str] = None
    # Scene Prompt Studio: "gemini" (default) | "openai" | "tokenlb"
    scene_prompt_provider: Optional[str] = None


def _resolve_google_key(request: _BaseKeyed) -> Optional[str]:
    import os

    key = (getattr(request, "google_api_key", None) or os.getenv("GOOGLE_API_KEY") or "").strip()
    return key or None


def _resolve_openai_key(request: _BaseKeyed) -> Optional[str]:
    import os

    key = (getattr(request, "openai_api_key", None) or os.getenv("OPENAI_API_KEY") or "").strip()
    return key or None


async def _run_scene_prompt_studio(
    request: _BaseKeyed,
    *,
    master_prompt: str,
    scene_text: str,
) -> tuple[Dict[str, Any], str, bool]:
    """Returns (result dict, provider name, fallback_used)."""
    import os

    provider = (getattr(request, "scene_prompt_provider", None) or "gemini").strip().lower()

    if provider == "gemini":
        google_key = _resolve_google_key(request)
        if not google_key:
            raise HTTPException(
                status_code=401,
                detail="Google API key required. Add it in Settings → API Keys (Gemini).",
            )
        model = (
            getattr(request, "gemini_model", None)
            or os.getenv("GEMINI_SCENE_PROMPT_MODEL")
            or "gemini-2.5-flash-lite"
        )
        result = await gemini_service.generate_scene_prompt_studio(
            master_prompt=master_prompt,
            scene_text=scene_text,
            api_key=google_key,
            model=model,
        )
        return result, "gemini", False

    if provider == "openai":
        openai_key = _resolve_openai_key(request)
        if not openai_key:
            raise HTTPException(
                status_code=401,
                detail="OpenAI API key required. Add sk-proj-… in Settings → API Keys.",
            )
        model = (
            getattr(request, "openai_model", None)
            or os.getenv("OPENAI_SCENE_PROMPT_MODEL")
            or "gpt-4o-mini"
        )
        result = await openai_service.generate_scene_prompt_studio(
            master_prompt=master_prompt,
            scene_text=scene_text,
            api_key=openai_key,
            model=model,
            max_tokens=2000,
        )
        return result, "openai", False

    primary, primary_key, primary_name = _pick_text_service(
        request.anthropic_api_key,
        request.google_api_key,
        request.tokenlb_api_key,
        "tokenlb",
        request.tokenlb_api_keys,
    )
    tokenlb_keys = _resolve_tokenlb_keys(request.tokenlb_api_key, request.tokenlb_api_keys)
    other_service, other_key, other_name = _other_provider(
        request.anthropic_api_key,
        request.google_api_key,
        primary_name,
        request.tokenlb_api_key,
        request.tokenlb_api_keys,
    )

    async def call(svc, k):
        return await svc.generate_scene_prompt_studio(
            master_prompt=master_prompt,
            scene_text=scene_text,
            api_key=k,
            **_llm_extras(request, svc, "studio"),
        )

    limits = extract_limits_from_body(request)
    result, used_provider, fallback_used = await _call_with_fallback(
        primary,
        primary_key,
        primary_name,
        other_service,
        other_key,
        other_name,
        call,
        "Scene prompt studio failed",
        limits,
        tokenlb_keys,
    )
    return result, used_provider, fallback_used


class StoryExpansionRequest(_BaseKeyed):
    idea: str
    genre: Optional[str] = "mythological"
    language: Optional[str] = "english"
    target_length: Optional[str] = "short"

class SceneBreakdownRequest(_BaseKeyed):
    story: str
    max_scenes: Optional[int] = 8
    min_duration_per_scene: Optional[int] = 3

class PromptGenerationRequest(_BaseKeyed):
    scene_description: str
    style: Optional[str] = "cinematic"
    continuity_bible: Optional[str] = None
    language: Optional[str] = "english"


class ScenePromptItem(BaseModel):
    id: str
    scene_number: Optional[int] = None
    brief_description: Optional[str] = None
    detailed_action: Optional[str] = None
    action: Optional[str] = None


class BatchScenePromptsRequest(_BaseKeyed):
    scenes: List[ScenePromptItem]
    style: Optional[str] = "cinematic"
    continuity_bible: Optional[str] = None
    language: Optional[str] = "english"
    story_language: Optional[str] = None


class ScenePromptStudioRequest(_BaseKeyed):
    master_prompt: str = Field(..., min_length=20)
    scene_text: str = Field(..., min_length=1)


class ScenePromptStudioBatchRequest(_BaseKeyed):
    master_prompt: str = Field(..., min_length=20)
    scenes: List[ScenePromptItem]


def _scene_description_for_prompts(scene: ScenePromptItem | Dict[str, Any]) -> str:
    data = scene.model_dump() if isinstance(scene, ScenePromptItem) else dict(scene)
    parts = [
        data.get("brief_description"),
        data.get("detailed_action"),
        data.get("action"),
    ]
    return " ".join(str(p).strip() for p in parts if p and str(p).strip()).strip()

class VoiceoverRequest(_BaseKeyed):
    scene_description: str
    language: Optional[str] = "english"
    max_words: Optional[int] = 30

class YouTubeCopyRequest(_BaseKeyed):
    story: str
    genre: Optional[str] = "mythological"
    language: Optional[str] = "english"

class ConsistencyCheckRequest(_BaseKeyed):
    prompts: List[str]
    continuity_bible: str


def _quota_name(svc: Any) -> Optional[str]:
    if svc is tokenlb_service:
        return "tokenlb"
    return None


def _llm_extras(request: _BaseKeyed, svc: Any, task: str = "") -> Dict[str, Any]:
    """TokenLB accepts base_url, model, key pool, limits, and capped max_tokens."""
    if svc is not tokenlb_service:
        return {}
    limits = extract_limits_from_body(request)
    out: Dict[str, Any] = {
        "limits": limits,
        "api_keys": _resolve_tokenlb_keys(request.tokenlb_api_key, request.tokenlb_api_keys),
    }
    if request.tokenlb_base_url:
        out["base_url"] = request.tokenlb_base_url
    if request.tokenlb_model:
        out["model"] = request.tokenlb_model
    per_task_cap = {
        "voiceover": 400,
        "enhance": 600,
        "youtube": 700,
        "consistency": 900,
        "prompts": 900,
        "studio": 2000,
        "breakdown": 1400,
        "expand": 1200,
    }
    global_cap = int(request.tokenlb_max_tokens or 1200)
    task_cap = per_task_cap.get(task, global_cap)
    out["max_tokens"] = min(global_cap, task_cap)
    if request.tokenlb_credit_saver and not request.tokenlb_model:
        cheap_models = {
            "voiceover": "gpt-5.4-mini",
            "enhance": "gpt-5.4-mini",
            "youtube": "gemini-3-flash-preview",
            "consistency": "gemini-3-flash-preview",
            "prompts": "gemini-3-flash-preview",
            "studio": "gpt-5.4",
            "expand": "gemini-3-flash-preview",
            "breakdown": "gemini-3-flash-preview",
        }
        if task in cheap_models:
            out["model"] = cheap_models[task]
    return out


# ----------------------------------------------------------------- endpoints

@router.post("/expand")
async def expand_story(request: StoryExpansionRequest):
    """
    Expand a story idea into a full narrative.
    Tries the primary provider, falls back to the other one if the primary
    has no credits / is rate-limited.
    """
    primary, primary_key, primary_name = _pick_text_service(
        request.anthropic_api_key,
        request.google_api_key,
        request.tokenlb_api_key,
        request.provider,
        request.tokenlb_api_keys,
    )
    tokenlb_keys = _resolve_tokenlb_keys(request.tokenlb_api_key, request.tokenlb_api_keys)
    other_service, other_key, other_name = _other_provider(
        request.anthropic_api_key,
        request.google_api_key,
        primary_name,
        request.tokenlb_api_key,
        request.tokenlb_api_keys,
    )

    async def call(svc, k):
        return await svc.generate_story_expansion(
            idea=request.idea,
            genre=request.genre,
            language=request.story_language or request.language,
            target_length=request.target_length,
            api_key=k,
            sample_story=request.sample_story,
            style_notes=request.style_notes,
            memory_summaries=request.memory_summaries,
            **_llm_extras(request, svc, "expand"),
        )

    limits = extract_limits_from_body(request)
    try:
        result, used_provider, fallback_used = await _call_with_fallback(
            primary, primary_key, primary_name,
            other_service, other_key, other_name,
            call, "Story expansion failed", limits, tokenlb_keys,
        )
    except HTTPException:
        raise

    return {
        "success": True,
        "expanded_story": result["expanded_story"],
        "metadata": {
            "genre": result["genre"],
            "language": result["language"],
            "length": result["length"],
            "token_usage": result.get("token_usage", {}),
            "provider": used_provider,
            "provider_fallback_used": fallback_used,
        }
    }

@router.post("/breakdown")
async def breakdown_story(request: SceneBreakdownRequest):
    """
    Break down a story into scenes for storyboard.
    """
    primary, primary_key, primary_name = _pick_text_service(
        request.anthropic_api_key,
        request.google_api_key,
        request.tokenlb_api_key,
        request.provider,
        request.tokenlb_api_keys,
    )
    tokenlb_keys = _resolve_tokenlb_keys(request.tokenlb_api_key, request.tokenlb_api_keys)
    other_service, other_key, other_name = _other_provider(
        request.anthropic_api_key,
        request.google_api_key,
        primary_name,
        request.tokenlb_api_key,
        request.tokenlb_api_keys,
    )

    async def call(svc, k):
        return await svc.generate_scene_breakdown(
            story=request.story,
            max_scenes=request.max_scenes,
            min_duration_per_scene=request.min_duration_per_scene,
            api_key=k,
            sample_story=request.sample_story,
            style_notes=request.style_notes,
            memory_summaries=request.memory_summaries,
            **_llm_extras(request, svc, "breakdown"),
        )

    limits = extract_limits_from_body(request)
    scenes, used_provider, fallback_used = await _call_with_fallback(
        primary, primary_key, primary_name,
        other_service, other_key, other_name,
        call, "Scene breakdown failed", limits, tokenlb_keys,
    )

    return {
        "success": True,
        "scenes": scenes,
        "scene_count": len(scenes),
        "metadata": {
            "provider": used_provider,
            "provider_fallback_used": fallback_used,
        }
    }

@router.post("/prompts")
async def generate_prompts(request: PromptGenerationRequest):
    """
    Generate image prompt for a scene.
    """
    primary, primary_key, primary_name = _pick_text_service(
        request.anthropic_api_key,
        request.google_api_key,
        request.tokenlb_api_key,
        request.provider,
        request.tokenlb_api_keys,
    )
    tokenlb_keys = _resolve_tokenlb_keys(request.tokenlb_api_key, request.tokenlb_api_keys)
    other_service, other_key, other_name = _other_provider(
        request.anthropic_api_key,
        request.google_api_key,
        primary_name,
        request.tokenlb_api_key,
        request.tokenlb_api_keys,
    )

    async def call(svc, k):
        return await svc.generate_image_prompt(
            scene_description=request.scene_description,
            style=request.style,
            continuity_bible=request.continuity_bible,
            language=request.story_language or request.language,
            api_key=k,
            sample_story=request.sample_story,
            style_notes=request.style_notes,
            memory_summaries=request.memory_summaries,
            **_llm_extras(request, svc, "prompts"),
        )

    limits = extract_limits_from_body(request)
    result, used_provider, fallback_used = await _call_with_fallback(
        primary, primary_key, primary_name,
        other_service, other_key, other_name,
        call, "Prompt generation failed", limits, tokenlb_keys,
    )

    return {
        "success": True,
        "prompt": result["prompt"],
        "negative_prompt": result.get("negative_prompt", ""),
        "motion_prompt": result.get("motion_prompt", ""),
        "metadata": {
            "style": request.style,
            "language": request.language,
            "has_continuity": bool(request.continuity_bible),
            "provider": used_provider,
            "provider_fallback_used": fallback_used,
        }
    }


@router.post("/scene-prompts-batch")
async def batch_scene_prompts(request: BatchScenePromptsRequest):
    """
    Generate image + animation prompts for each storyboard scene (before image gen).
    """
    if not request.scenes:
        raise HTTPException(status_code=400, detail="No scenes provided")

    primary, primary_key, primary_name = _pick_text_service(
        request.anthropic_api_key,
        request.google_api_key,
        request.tokenlb_api_key,
        request.provider,
        request.tokenlb_api_keys,
    )
    tokenlb_keys = _resolve_tokenlb_keys(request.tokenlb_api_key, request.tokenlb_api_keys)
    other_service, other_key, other_name = _other_provider(
        request.anthropic_api_key,
        request.google_api_key,
        primary_name,
        request.tokenlb_api_key,
        request.tokenlb_api_keys,
    )
    limits = extract_limits_from_body(request)
    lang = request.story_language or request.language or "english"
    out: List[Dict[str, Any]] = []

    for scene in request.scenes:
        desc = _scene_description_for_prompts(scene)
        if not desc:
            out.append({
                "id": scene.id,
                "scene_number": scene.scene_number,
                "image_prompt": "",
                "negative_prompt": "",
                "motion_prompt": "",
                "error": "Scene has no description text",
            })
            continue

        async def call(svc, k, description=desc):
            return await svc.generate_image_prompt(
                scene_description=description,
                style=request.style or "cinematic",
                continuity_bible=request.continuity_bible,
                language=lang,
                sample_story=request.sample_story,
                style_notes=request.style_notes,
                memory_summaries=request.memory_summaries,
                api_key=k,
                **_llm_extras(request, svc, "prompts"),
            )

        result, used_provider, fallback_used = await _call_with_fallback(
            primary, primary_key, primary_name,
            other_service, other_key, other_name,
            call, f"Prompt generation failed for scene {scene.scene_number or scene.id}",
            limits, tokenlb_keys,
        )
        out.append({
            "id": scene.id,
            "scene_number": scene.scene_number,
            "image_prompt": result.get("prompt", ""),
            "negative_prompt": result.get("negative_prompt", ""),
            "motion_prompt": result.get("motion_prompt", ""),
            "metadata": {
                "provider": used_provider,
                "provider_fallback_used": fallback_used,
            },
        })

    return {"success": True, "scenes": out, "scene_count": len(out)}


@router.post("/scene-prompt-studio")
async def scene_prompt_studio(request: ScenePromptStudioRequest):
    """
    ChatGPT-style workflow: user master prompt + one scene line → image + animation prompts.
    """
    result, used_provider, fallback_used = await _run_scene_prompt_studio(
        request,
        master_prompt=request.master_prompt,
        scene_text=request.scene_text,
    )

    return {
        "success": True,
        "scene_summary": result.get("scene_summary", ""),
        "image_prompt": result.get("image_prompt", ""),
        "motion_prompt": result.get("motion_prompt", ""),
        "metadata": {
            "provider": used_provider,
            "model": result.get("model"),
            "provider_fallback_used": fallback_used,
        },
    }


@router.post("/scene-prompt-studio-batch")
async def scene_prompt_studio_batch(request: ScenePromptStudioBatchRequest):
    """Master prompt + multiple scenes — one studio call per scene."""
    if not request.scenes:
        raise HTTPException(status_code=400, detail="No scenes provided")

    out: List[Dict[str, Any]] = []

    for scene in request.scenes:
        scene_text = _scene_description_for_prompts(scene)
        if not scene_text:
            out.append({
                "id": scene.id,
                "scene_number": scene.scene_number,
                "scene_summary": "",
                "image_prompt": "",
                "motion_prompt": "",
                "error": "Scene has no description text",
            })
            continue

        result, used_provider, fallback_used = await _run_scene_prompt_studio(
            request,
            master_prompt=request.master_prompt,
            scene_text=scene_text,
        )
        out.append({
            "id": scene.id,
            "scene_number": scene.scene_number,
            "scene_summary": result.get("scene_summary", ""),
            "image_prompt": result.get("image_prompt", ""),
            "motion_prompt": result.get("motion_prompt", ""),
            "metadata": {
                "provider": used_provider,
                "model": result.get("model"),
                "provider_fallback_used": fallback_used,
            },
        })

    return {"success": True, "scenes": out, "scene_count": len(out)}


@router.post("/voiceover")
async def generate_voiceover(request: VoiceoverRequest):
    """
    Generate voiceover narration for a scene.
    """
    primary, primary_key, primary_name = _pick_text_service(
        request.anthropic_api_key,
        request.google_api_key,
        request.tokenlb_api_key,
        request.provider,
        request.tokenlb_api_keys,
    )
    tokenlb_keys = _resolve_tokenlb_keys(request.tokenlb_api_key, request.tokenlb_api_keys)
    other_service, other_key, other_name = _other_provider(
        request.anthropic_api_key,
        request.google_api_key,
        primary_name,
        request.tokenlb_api_key,
        request.tokenlb_api_keys,
    )

    async def call(svc, k):
        return await svc.generate_voiceover_script(
            scene_description=request.scene_description,
            language=request.story_language or request.language,
            max_words=request.max_words,
            api_key=k,
            sample_story=request.sample_story,
            style_notes=request.style_notes,
            memory_summaries=request.memory_summaries,
            **_llm_extras(request, svc, "voiceover"),
        )

    limits = extract_limits_from_body(request)
    vo_text, used_provider, fallback_used = await _call_with_fallback(
        primary, primary_key, primary_name,
        other_service, other_key, other_name,
        call, "Voiceover generation failed", limits, tokenlb_keys,
    )

    return {
        "success": True,
        "voiceover_text": vo_text,
        "metadata": {
            "provider": used_provider,
            "provider_fallback_used": fallback_used,
        }
    }

@router.post("/youtube-copy")
async def generate_youtube_copy(request: YouTubeCopyRequest):
    """
    Generate YouTube metadata (title, description, tags).
    """
    primary, primary_key, primary_name = _pick_text_service(
        request.anthropic_api_key,
        request.google_api_key,
        request.tokenlb_api_key,
        request.provider,
        request.tokenlb_api_keys,
    )
    tokenlb_keys = _resolve_tokenlb_keys(request.tokenlb_api_key, request.tokenlb_api_keys)
    other_service, other_key, other_name = _other_provider(
        request.anthropic_api_key,
        request.google_api_key,
        primary_name,
        request.tokenlb_api_key,
        request.tokenlb_api_keys,
    )

    async def call(svc, k):
        return await svc.generate_youtube_copy(
            story=request.story,
            genre=request.genre,
            language=request.story_language or request.language,
            api_key=k,
            sample_story=request.sample_story,
            style_notes=request.style_notes,
            memory_summaries=request.memory_summaries,
            **_llm_extras(request, svc, "youtube"),
        )

    limits = extract_limits_from_body(request)
    result, used_provider, fallback_used = await _call_with_fallback(
        primary, primary_key, primary_name,
        other_service, other_key, other_name,
        call, "YouTube copy generation failed", limits, tokenlb_keys,
    )

    return {
        "success": True,
        "youtube_copy": result,
        "metadata": {
            "provider": used_provider,
            "provider_fallback_used": fallback_used,
        }
    }

@router.post("/enhance-prompt")
async def enhance_prompt(request: PromptGenerationRequest):
    """
    Enhance a rough prompt with professional details.
    """
    primary, primary_key, primary_name = _pick_text_service(
        request.anthropic_api_key,
        request.google_api_key,
        request.tokenlb_api_key,
        request.provider,
        request.tokenlb_api_keys,
    )
    tokenlb_keys = _resolve_tokenlb_keys(request.tokenlb_api_key, request.tokenlb_api_keys)
    other_service, other_key, other_name = _other_provider(
        request.anthropic_api_key,
        request.google_api_key,
        primary_name,
        request.tokenlb_api_key,
        request.tokenlb_api_keys,
    )

    async def call(svc, k):
        return await svc.enhance_prompt(
            rough_prompt=request.scene_description,
            style=request.style,
            api_key=k,
            sample_story=request.sample_story,
            style_notes=request.style_notes,
            memory_summaries=request.memory_summaries,
            **_llm_extras(request, svc, "enhance"),
        )

    limits = extract_limits_from_body(request)
    enhanced, used_provider, fallback_used = await _call_with_fallback(
        primary, primary_key, primary_name,
        other_service, other_key, other_name,
        call, "Prompt enhancement failed", limits, tokenlb_keys,
    )

    return {
        "success": True,
        "enhanced_prompt": enhanced,
        "metadata": {
            "provider": used_provider,
            "provider_fallback_used": fallback_used,
        }
    }

@router.post("/check-consistency")
async def check_consistency(request: ConsistencyCheckRequest):
    """
    Check prompts for consistency with continuity rules.
    """
    primary, primary_key, primary_name = _pick_text_service(
        request.anthropic_api_key,
        request.google_api_key,
        request.tokenlb_api_key,
        request.provider,
        request.tokenlb_api_keys,
    )
    tokenlb_keys = _resolve_tokenlb_keys(request.tokenlb_api_key, request.tokenlb_api_keys)
    other_service, other_key, other_name = _other_provider(
        request.anthropic_api_key,
        request.google_api_key,
        primary_name,
        request.tokenlb_api_key,
        request.tokenlb_api_keys,
    )

    async def call(svc, k):
        return await svc.check_consistency(
            prompts=request.prompts,
            continuity_bible=request.continuity_bible,
            api_key=k,
            sample_story=request.sample_story,
            style_notes=request.style_notes,
            memory_summaries=request.memory_summaries,
            **_llm_extras(request, svc, "consistency"),
        )

    limits = extract_limits_from_body(request)
    result, used_provider, fallback_used = await _call_with_fallback(
        primary, primary_key, primary_name,
        other_service, other_key, other_name,
        call, "Consistency check failed", limits, tokenlb_keys,
    )

    return {
        "success": True,
        "consistency_report": result,
        "metadata": {
            "provider": used_provider,
            "provider_fallback_used": fallback_used,
        }
    }
