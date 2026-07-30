"""
Durex AI — image & video transform via Hostinger proxy.

POST {base}?key={key}&proxy={proxy}
  files: image | video
  data: prompt
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

import requests
from fastapi import HTTPException

from storage_paths import STORAGE_ROOT, ensure_dir

logger = logging.getLogger(__name__)

_IMAGE_DIR = ensure_dir("generated", "durex")
_VIDEO_DIR = ensure_dir("generated", "durex", "video")

DEFAULT_BASE_URL = "https://gold-newt-367030.hostingersite.com/durex.php"
DEFAULT_VIDEO_BASE_URL = ""  # optional DUREX_VIDEO_API_URL; falls back to image URL
DEFAULT_API_KEY = "durexapi"


class DurexService:
    def _base_url(self, override: Optional[str] = None) -> str:
        return (override or os.getenv("DUREX_API_URL") or DEFAULT_BASE_URL).rstrip("/")

    def _video_base_url(self, override: Optional[str] = None) -> str:
        url = (
            override
            or os.getenv("DUREX_VIDEO_API_URL")
            or DEFAULT_VIDEO_BASE_URL
            or os.getenv("DUREX_API_URL")
            or DEFAULT_BASE_URL
        )
        return url.rstrip("/")

    def _api_key(self, override: Optional[str] = None) -> str:
        key = override or os.getenv("DUREX_API_KEY") or DEFAULT_API_KEY
        if not key:
            raise HTTPException(status_code=401, detail="Durex API key not configured.")
        return key

    def _download_to_storage(
        self,
        remote_url: str,
        *,
        subdir: str = "durex",
        ext: str = "jpg",
    ) -> tuple[str, str]:
        resp = requests.get(remote_url, timeout=180)
        resp.raise_for_status()
        ctype = (resp.headers.get("content-type") or "").lower()
        if "mp4" in ctype or remote_url.lower().endswith(".mp4"):
            ext = "mp4"
        elif "webm" in ctype or remote_url.lower().endswith(".webm"):
            ext = "webm"
        elif "png" in ctype:
            ext = "png"
        file_id = uuid.uuid4().hex[:12]
        folder = _STORAGE_ROOT / "generated" / subdir
        folder.mkdir(parents=True, exist_ok=True)
        local_path = folder / f"{file_id}.{ext}"
        local_path.write_bytes(resp.content)
        rel = f"/storage/generated/{subdir}/{file_id}.{ext}"
        return rel, str(local_path)

    def _parse_durex_payload(self, payload: Dict[str, Any]) -> str:
        for key in ("download_url", "video_url", "url", "result_url"):
            val = payload.get(key)
            if val and isinstance(val, str):
                return val
        raise HTTPException(status_code=502, detail=f"Durex response missing media URL: {payload}")

    def _post_durex(
        self,
        *,
        url: str,
        files: Dict[str, tuple],
        prompt: str,
        api_key: Optional[str],
        proxy: Optional[str],
        timeout_seconds: int,
    ) -> Dict[str, Any]:
        params: Dict[str, str] = {"key": self._api_key(api_key)}
        if proxy and proxy.strip():
            params["proxy"] = proxy.strip()
        try:
            resp = requests.post(
                url,
                params=params,
                files=files,
                data={"prompt": prompt.strip()},
                timeout=timeout_seconds,
            )
        except requests.RequestException as e:
            raise HTTPException(status_code=502, detail=f"Durex request failed: {e}") from e
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=f"Durex error: {resp.text[:300]}")
        try:
            payload = resp.json()
        except ValueError as e:
            raise HTTPException(status_code=502, detail=f"Durex returned non-JSON: {resp.text[:200]}") from e
        if not payload.get("success"):
            raise HTTPException(status_code=502, detail=f"Durex generation failed: {payload}")
        return payload

    async def transform_image(
        self,
        image_bytes: bytes,
        prompt: str,
        filename: str = "upload.jpg",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        proxy: Optional[str] = None,
        timeout_seconds: int = 300,
    ) -> Dict[str, Any]:
        url = self._base_url(base_url)
        files = {"image": (filename, image_bytes, "image/jpeg")}
        payload = self._post_durex(
            url=url,
            files=files,
            prompt=prompt,
            api_key=api_key,
            proxy=proxy,
            timeout_seconds=timeout_seconds,
        )
        remote = self._parse_durex_payload(payload)
        try:
            image_url, image_path = self._download_to_storage(remote, subdir="durex", ext="jpg")
        except requests.RequestException as e:
            logger.warning("Durex download failed, using remote url: %s", e)
            image_url = remote
            image_path = ""

        return {
            "success": True,
            "image_url": image_url,
            "image_path": image_path,
            "engine": "durex",
            "metadata": {
                "prompt_used": prompt,
                "task": payload.get("task"),
                "time_taken": payload.get("time_taken"),
                "channel": payload.get("channel"),
                "remote_url": remote,
                "proxy_used": bool(proxy and proxy.strip()),
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }

    async def transform_video(
        self,
        video_bytes: bytes,
        prompt: str,
        filename: str = "upload.mp4",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        proxy: Optional[str] = None,
        timeout_seconds: int = 600,
    ) -> Dict[str, Any]:
        url = self._video_base_url(base_url)
        mime = "video/webm" if filename.lower().endswith(".webm") else "video/mp4"
        file_sets = [
            {"video": (filename, video_bytes, mime)},
            {"file": (filename, video_bytes, mime)},
            {"media": (filename, video_bytes, mime)},
            {"image": (filename, video_bytes, mime)},
        ]
        last_error: Optional[HTTPException] = None
        payload: Optional[Dict[str, Any]] = None
        for files in file_sets:
            try:
                payload = self._post_durex(
                    url=url,
                    files=files,
                    prompt=prompt,
                    api_key=api_key,
                    proxy=proxy,
                    timeout_seconds=timeout_seconds,
                )
                break
            except HTTPException as e:
                last_error = e
                continue
        if payload is None:
            raise last_error or HTTPException(status_code=502, detail="Durex video transform failed.")

        remote = self._parse_durex_payload(payload)
        try:
            video_url, video_path = self._download_to_storage(remote, subdir="durex/video", ext="mp4")
        except requests.RequestException as e:
            logger.warning("Durex video download failed, using remote url: %s", e)
            video_url = remote
            video_path = ""

        return {
            "success": True,
            "video_url": video_url,
            "video_path": video_path,
            "engine": "durex-video",
            "metadata": {
                "prompt_used": prompt,
                "task": payload.get("task"),
                "time_taken": payload.get("time_taken"),
                "channel": payload.get("channel"),
                "remote_url": remote,
                "proxy_used": bool(proxy and proxy.strip()),
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }


durex_service = DurexService()
