"""Direct OpenAI ChatGPT API — Scene Prompt Studio."""
from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, Optional

import requests
from fastapi import HTTPException

from services.scene_prompt_studio import parse_scene_prompt_studio_output

DEFAULT_SCENE_PROMPT_MODEL = "gpt-4o-mini"
OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"


class OpenAIService:
    def _api_key(self, override: Optional[str] = None) -> str:
        key = (override or os.getenv("OPENAI_API_KEY") or "").strip()
        if not key:
            raise HTTPException(
                status_code=401,
                detail="OpenAI API key not configured. Add it in Settings → API Keys.",
            )
        return key

    def _chat_sync(
        self,
        *,
        messages: list,
        api_key: str,
        model: str,
        max_tokens: int = 2000,
        temperature: float = 0.65,
    ) -> str:
        try:
            response = requests.post(
                OPENAI_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
                timeout=120,
            )
        except requests.RequestException as exc:
            raise HTTPException(
                status_code=502,
                detail=f"OpenAI request failed: {exc}",
            ) from exc

        if response.status_code != 200:
            detail = response.text[:500]
            try:
                detail = response.json().get("error", {}).get("message", detail)
            except Exception:
                pass
            if response.status_code in (401, 403):
                raise HTTPException(status_code=401, detail=f"OpenAI auth failed: {detail}")
            if response.status_code == 429:
                raise HTTPException(status_code=429, detail=f"OpenAI limit: {detail}")
            raise HTTPException(status_code=response.status_code, detail=f"OpenAI error: {detail}")

        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            raise HTTPException(status_code=500, detail="OpenAI returned no choices")
        content = choices[0].get("message", {}).get("content", "")
        if not str(content).strip():
            raise HTTPException(status_code=500, detail="OpenAI returned empty content")
        return str(content)

    async def generate_scene_prompt_studio(
        self,
        master_prompt: str,
        scene_text: str,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 2000,
    ) -> Dict[str, Any]:
        key = self._api_key(api_key)
        model_name = (model or os.getenv("OPENAI_SCENE_PROMPT_MODEL") or DEFAULT_SCENE_PROMPT_MODEL).strip()
        text = await asyncio.to_thread(
            self._chat_sync,
            messages=[
                {"role": "system", "content": master_prompt.strip()},
                {"role": "user", "content": scene_text.strip()},
            ],
            api_key=key,
            model=model_name,
            max_tokens=max_tokens,
        )
        parsed = parse_scene_prompt_studio_output(text)
        parsed["model"] = model_name
        return parsed


openai_service = OpenAIService()
