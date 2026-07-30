"""
Nano Banana Pro — free image generation via Hostinger proxy.

GET {base}?key={key}&prompt={prompt}
Returns JSON: { url, prompt, time_taken }
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from datetime import datetime
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlencode

import requests
from fastapi import HTTPException

from storage_paths import ensure_dir

logger = logging.getLogger(__name__)

_IMAGES_DIR = ensure_dir("generated", "nano")
_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_BASE_URL = "https://gold-newt-367030.hostingersite.com/nano.php"
DEFAULT_API_KEY = "USAGIWK"
# Hostinger nano.php is GET-only; very long prompts blow URL limits — cap with a note in metadata.
MAX_PROMPT_CHARS = 3500
REQUEST_TIMEOUT: Tuple[int, int] = (20, 360)  # (connect, read) — generation often takes 45–60s


class NanoBananaService:
    def _base_url(self, override: Optional[str] = None) -> str:
        return (override or os.getenv("NANO_API_URL") or DEFAULT_BASE_URL).rstrip("/")

    def _api_key(self, override: Optional[str] = None) -> str:
        key = override or os.getenv("NANO_API_KEY") or DEFAULT_API_KEY
        if not key:
            raise HTTPException(status_code=401, detail="Nano Banana API key not configured.")
        return key

    def _download_to_storage(self, remote_url: str) -> tuple[str, str]:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
            ),
            "Accept": "image/*,*/*",
        }
        resp = requests.get(remote_url, headers=headers, timeout=120)
        resp.raise_for_status()
        if not resp.content or len(resp.content) < 200:
            raise requests.RequestException(f"Downloaded file too small ({len(resp.content)} bytes)")
        file_id = uuid.uuid4().hex[:12]
        local_path = _IMAGES_DIR / f"{file_id}.png"
        local_path.write_bytes(resp.content)
        rel = f"/storage/generated/nano/{file_id}.png"
        return rel, str(local_path)

    async def generate_image(
        self,
        prompt: str,
        style: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: int = 300,
    ) -> Dict[str, Any]:
        """Generate a 2K image. Style/aspect are appended to the prompt hint."""
        full_prompt = prompt.strip()
        if style:
            full_prompt = f"{full_prompt}, {style} style"
        if aspect_ratio:
            full_prompt = f"{full_prompt}, aspect ratio {aspect_ratio}"

        truncated = False
        if len(full_prompt) > MAX_PROMPT_CHARS:
            full_prompt = full_prompt[:MAX_PROMPT_CHARS].rsplit(" ", 1)[0]
            truncated = True

        base = self._base_url(base_url)
        key = self._api_key(api_key)
        params = urlencode({"key": key, "prompt": full_prompt})
        url = f"{base}?{params}"

        connect, read = REQUEST_TIMEOUT
        if isinstance(timeout_seconds, int) and timeout_seconds > 0:
            read = max(read, timeout_seconds)

        last_err: Optional[Exception] = None
        resp = None
        for attempt in range(3):
            try:
                resp = requests.get(url, timeout=(connect, read))
                break
            except requests.RequestException as e:
                last_err = e
                if attempt < 2:
                    time.sleep(2 * (attempt + 1))
        if resp is None:
            raise HTTPException(
                status_code=502,
                detail=f"Nano Banana request failed after retries: {last_err}",
            ) from last_err

        if resp.status_code >= 400:
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Nano Banana error: {resp.text[:300]}",
            )

        try:
            data = resp.json()
        except ValueError as e:
            raise HTTPException(status_code=502, detail=f"Nano Banana returned non-JSON: {resp.text[:200]}") from e

        remote = data.get("url")
        if not remote:
            raise HTTPException(status_code=502, detail=f"Nano Banana response missing url: {data}")

        try:
            image_url, image_path = self._download_to_storage(remote)
        except requests.RequestException as e:
            # Fall back to remote URL if local download fails.
            logger.warning("Nano download failed, using remote url: %s", e)
            image_url = remote
            image_path = ""

        return {
            "image_url": image_url,
            "image_path": image_path,
            "engine": "nano-banana",
            "metadata": {
                "prompt_used": full_prompt,
                "aspect_ratio": aspect_ratio,
                "style": style,
                "model": "nano-banana-pro",
                "remote_url": remote,
                "time_taken": data.get("time_taken"),
                "prompt_truncated": truncated,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }


nano_banana_service = NanoBananaService()
