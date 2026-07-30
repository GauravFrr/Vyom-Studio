"""
TokenLB (New API) — OpenAI-compatible chat for story pipeline.

Base URL: https://tokenlb.net/v1  (from https://tokenlb.net/keys)
Models: claude-opus-4-6/4-7, claude-sonnet-4-6, gemini-3-flash-preview,
        gpt-5.4, gpt-5.4-mini, gpt-5.5
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

import requests
from fastapi import HTTPException

from services.claude_service import _extract_json
from services.scene_prompt_studio import parse_scene_prompt_studio_output
from services.usage_limiter import (
    UsageLimitsConfig,
    check_quota,
    check_tokenlb_pool,
    pick_tokenlb_keys_ordered,
    record_tokenlb_key_use,
    tokenlb_key_id,
)

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://tokenlb.net/v1"
DEFAULT_MODEL = "gemini-3-flash-preview"

# Cheapest models first — lowest token burn on TokenLB credits.
LOW_COST_MODEL = "gpt-5.4-mini"
LOW_COST_MODEL_JSON = "gemini-3-flash-preview"

AVAILABLE_MODELS = (
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "gemini-3-flash-preview",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
)


class TokenLBService:
    def _base_url(self, override: Optional[str] = None) -> str:
        return (override or os.getenv("TOKENLB_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")

    def _api_key(self, override: Optional[str] = None) -> str:
        key = override or os.getenv("TOKENLB_API_KEY")
        if not key:
            raise HTTPException(
                status_code=401,
                detail="TokenLB API key not configured. Add it in Settings → API Keys.",
            )
        return key

    def _model(self, override: Optional[str] = None) -> str:
        return override or os.getenv("TOKENLB_DEFAULT_MODEL") or DEFAULT_MODEL

    @staticmethod
    def _is_quota_error(status_code: int, body: str) -> bool:
        if status_code in (402, 429):
            return True
        l = (body or "").lower()
        return any(x in l for x in ("quota", "credit", "billing", "no payment", "exhausted"))

    def _chat_sync(
        self,
        messages: List[Dict[str, str]],
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 1200,
        temperature: float = 0.7,
        timeout: int = 180,
    ) -> str:
        url = f"{self._base_url(base_url)}/chat/completions"
        payload = {
            "model": self._model(model),
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        try:
            resp = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {self._api_key(api_key)}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=timeout,
            )
        except requests.RequestException as e:
            raise HTTPException(status_code=502, detail=f"TokenLB request failed: {e}") from e

        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail=f"TokenLB auth failed: {resp.text[:200]}")
        if resp.status_code == 402 or resp.status_code == 429:
            raise HTTPException(status_code=resp.status_code, detail=f"TokenLB quota/credits: {resp.text[:200]}")
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=f"TokenLB error: {resp.text[:300]}")

        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as e:
            raise HTTPException(status_code=502, detail=f"TokenLB unexpected response: {data}") from e

    def _chat_pool_sync(
        self,
        api_keys: List[str],
        limits: UsageLimitsConfig,
        messages: List[Dict[str, str]],
        **kwargs: Any,
    ) -> str:
        check_tokenlb_pool(api_keys, limits)
        ordered = pick_tokenlb_keys_ordered(api_keys, limits)
        last_detail = "All TokenLB keys failed."
        for key in ordered:
            if limits.enabled:
                check_quota(tokenlb_key_id(key), limits)
            try:
                text = self._chat_sync(messages, api_key=key, **kwargs)
                record_tokenlb_key_use(key)
                return text
            except HTTPException as e:
                last_detail = str(e.detail)
                if self._is_quota_error(e.status_code, last_detail) or e.status_code == 401:
                    logger.info("TokenLB key %s failed (%s), trying next", tokenlb_key_id(key), e.status_code)
                    continue
                raise
        raise HTTPException(status_code=429, detail=f"TokenLB pool exhausted: {last_detail}")

    async def _chat(
        self,
        *,
        messages: List[Dict[str, str]],
        api_key: Optional[str] = None,
        api_keys: Optional[List[str]] = None,
        limits: Optional[UsageLimitsConfig] = None,
        **kwargs: Any,
    ) -> str:
        lim = limits or UsageLimitsConfig()
        pool = [k.strip() for k in (api_keys or []) if k and str(k).strip()]
        if not pool and api_key and str(api_key).strip():
            pool = [api_key.strip()]

        if len(pool) > 1:
            return await asyncio.to_thread(
                self._chat_pool_sync, pool, lim, messages, **kwargs
            )
        if len(pool) == 1:
            check_tokenlb_pool(pool, lim)
            if lim.enabled:
                check_quota(tokenlb_key_id(pool[0]), lim)
            text = await asyncio.to_thread(
                self._chat_sync, messages, api_key=pool[0], **kwargs
            )
            record_tokenlb_key_use(pool[0])
            return text
        return await asyncio.to_thread(self._chat_sync, messages, api_key=api_key, **kwargs)

    @staticmethod
    def _style_context_block(
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
    ) -> str:
        parts: List[str] = []
        if memory_summaries:
            bullet = "\n".join(f"- {s.strip()}" for s in memory_summaries if s and s.strip())
            if bullet:
                parts.append(
                    "PREVIOUS PROJECTS (style + topic memory from this user's recent work):\n"
                    + bullet
                )
        if style_notes and style_notes.strip():
            parts.append("STYLE NOTES (rules the user wants honoured on every output):\n" + style_notes.strip())
        if sample_story and sample_story.strip():
            parts.append(
                "REFERENCE STORY (match this tone, pacing, sentence length, and emotional beats):\n"
                + sample_story.strip()
            )
        if not parts:
            return ""
        return "--- USER STYLE CONTEXT ---\n" + "\n\n".join(parts) + "\n--- END USER STYLE CONTEXT ---"

    @staticmethod
    def _style_context(style: str) -> str:
        styles = {
            "cinematic": "Hollywood movie still, dramatic lighting, 35mm film",
            "painterly": "Oil painting style, visible brush strokes",
            "anime": "Japanese anime style, vibrant colors",
            "photorealistic": "Ultra-realistic photography",
            "watercolor": "Watercolor painting, soft edges",
            "comic": "Comic book style, bold outlines",
            "storybook": "Whimsical illustration, warm colors",
        }
        return styles.get(style, "cinematic photography style")

    async def generate_story_expansion(
        self,
        idea: str,
        genre: str = "mythological",
        language: str = "english",
        target_length: str = "short",
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
        api_keys: Optional[List[str]] = None,
        limits: Optional[UsageLimitsConfig] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        length_desc = {
            "short": "ONE flowing paragraph, ~400-500 Hindi words (50-60 second YouTube Short narration). No scene headers or bullet points.",
            "medium": "5-7 paragraphs (1-2 minute narration)",
            "long": "10+ paragraphs (3-5 minute story)",
        }.get(target_length, "ONE flowing paragraph (~50-60 sec)")

        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        system = (
            f"You are a master storyteller specializing in {genre} stories for Hindi YouTube Shorts. "
            f"Expand the user's brief idea into a compelling narrative of {length_desc}. "
            f"Write in {language}. Include vivid descriptions, village emotions, magical twists, "
            f"and a like/subscribe ending when appropriate. Output ONLY the story text."
        )
        if style_block:
            system += f"\n\n{style_block}"

        text = await self._chat(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"Story idea: {idea}\n\nExpand into a full {genre} story."},
            ],
            api_key=api_key,
            api_keys=api_keys,
            limits=limits,
            base_url=base_url,
            model=model,
            max_tokens=max_tokens or 1200,
        )
        return {
            "expanded_story": text.strip(),
            "genre": genre,
            "language": language,
            "length": target_length,
            "token_usage": {},
        }

    async def generate_scene_breakdown(
        self,
        story: str,
        max_scenes: int = 8,
        min_duration_per_scene: int = 3,
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
        api_keys: Optional[List[str]] = None,
        limits: Optional[UsageLimitsConfig] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        system = (
            f"Break the story into {max_scenes} scenes for a visual storyboard. "
            f"Each scene: scene_number, brief_description, detailed_action, mood, "
            f"suggested_camera_angle, estimated_duration_seconds (min {min_duration_per_scene}), "
            f"key_visual_elements (array). Return ONLY a JSON array."
        )
        if style_block:
            system += f"\n\n{style_block}"

        text = await self._chat(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"Story:\n\n{story}"},
            ],
            api_key=api_key,
            api_keys=api_keys,
            limits=limits,
            base_url=base_url,
            model=model,
            max_tokens=max_tokens or 1400,
        )
        return _extract_json(text)

    async def generate_image_prompt(
        self,
        scene_description: str,
        style: str = "cinematic",
        continuity_bible: Optional[str] = None,
        language: str = "english",
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
        api_keys: Optional[List[str]] = None,
        limits: Optional[UsageLimitsConfig] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        continuity = f"\nContinuity: {continuity_bible}" if continuity_bible else ""
        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        system = (
            f"Expert image prompt engineer. Style: {self._style_context(style)}. "
            f'Return JSON with "prompt", "negative_prompt", and "motion_prompt" only. '
            f'motion_prompt = short image-to-video direction (camera + subject movement, 20-40 words).'
        )
        if style_block:
            system += f"\n\n{style_block}"

        text = await self._chat(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"Scene: {scene_description}{continuity}"},
            ],
            api_key=api_key,
            api_keys=api_keys,
            limits=limits,
            base_url=base_url,
            model=model,
            max_tokens=max_tokens or 900,
        )
        data = _extract_json(text)
        return {
            "prompt": data.get("prompt", ""),
            "negative_prompt": data.get("negative_prompt", ""),
            "motion_prompt": data.get("motion_prompt", ""),
        }

    async def generate_scene_prompt_studio(
        self,
        master_prompt: str,
        scene_text: str,
        api_key: Optional[str] = None,
        api_keys: Optional[List[str]] = None,
        limits: Optional[UsageLimitsConfig] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, str]:
        text = await self._chat(
            messages=[
                {"role": "system", "content": master_prompt.strip()},
                {"role": "user", "content": scene_text.strip()},
            ],
            api_key=api_key,
            api_keys=api_keys,
            limits=limits,
            base_url=base_url,
            model=model,
            max_tokens=max_tokens or 2000,
            temperature=0.65,
        )
        return parse_scene_prompt_studio_output(text)

    async def generate_voiceover_script(
        self,
        scene_description: str,
        language: str = "english",
        max_words: int = 30,
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
        api_keys: Optional[List[str]] = None,
        limits: Optional[UsageLimitsConfig] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        system = (
            f"Write voiceover narration. Language: {language}. Max {max_words} words. "
            f"Output ONLY narration text."
        )
        if style_block:
            system += f"\n\n{style_block}"

        text = await self._chat(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"Scene: {scene_description}"},
            ],
            api_key=api_key,
            api_keys=api_keys,
            limits=limits,
            base_url=base_url,
            model=model,
            max_tokens=max_tokens or 400,
        )
        return text.strip()

    async def generate_youtube_copy(
        self,
        story: str,
        genre: str = "mythological",
        language: str = "english",
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
        api_keys: Optional[List[str]] = None,
        limits: Optional[UsageLimitsConfig] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        system = (
            f"YouTube SEO for {genre} Shorts. Language: {language}. "
            f'Return JSON: title, description, tags (array).'
        )
        if style_block:
            system += f"\n\n{style_block}"

        text = await self._chat(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"Story:\n\n{story}"},
            ],
            api_key=api_key,
            api_keys=api_keys,
            limits=limits,
            base_url=base_url,
            model=model,
            max_tokens=max_tokens or 700,
        )
        data = _extract_json(text)
        return {
            "title": data.get("title", ""),
            "description": data.get("description", ""),
            "tags": data.get("tags", []),
        }

    async def enhance_prompt(
        self,
        rough_prompt: str,
        style: str = "cinematic",
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
        api_keys: Optional[List[str]] = None,
        limits: Optional[UsageLimitsConfig] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        system = (
            f"Enhance this image prompt. Style: {self._style_context(style)}. "
            f"Output ONLY the enhanced prompt."
        )
        if style_block:
            system += f"\n\n{style_block}"

        text = await self._chat(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"Rough prompt: {rough_prompt}"},
            ],
            api_key=api_key,
            api_keys=api_keys,
            limits=limits,
            base_url=base_url,
            model=model,
            max_tokens=max_tokens or 600,
        )
        return text.strip()

    async def check_consistency(
        self,
        prompts: List[str],
        continuity_bible: str,
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
        api_keys: Optional[List[str]] = None,
        limits: Optional[UsageLimitsConfig] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        prompts_text = "\n\n".join(f"Prompt {i+1}: {p}" for i, p in enumerate(prompts))
        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        system = (
            f"Check prompts vs continuity bible. Return JSON: issues (array), suggestions (object).\n"
            f"Bible:\n{continuity_bible}"
        )
        if style_block:
            system += f"\n\n{style_block}"

        text = await self._chat(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompts_text},
            ],
            api_key=api_key,
            api_keys=api_keys,
            limits=limits,
            base_url=base_url,
            model=model,
            max_tokens=max_tokens or 900,
        )
        return _extract_json(text)


tokenlb_service = TokenLBService()
