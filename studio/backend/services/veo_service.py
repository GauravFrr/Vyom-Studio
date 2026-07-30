"""
VEO 3 via veoaifree.com — text-to-video, image (Nano Banana tab), prompt enhance.

Flow matches veoaifree.com browser requests:
  1. POST veo-video-generator/ (establish cookies + read nonce)
  2. POST wp-admin/admin-ajax.php with action=veo_video_generator
  3. Poll final-video-results for video jobs
"""
from __future__ import annotations

import base64
import json
import logging
import os
import random
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import requests
from fastapi import HTTPException

from storage_paths import STORAGE_ROOT, ensure_dir

logger = logging.getLogger(__name__)

_VIDEOS_DIR = ensure_dir("generated", "veo")
_IMAGES_DIR = _VIDEOS_DIR
_GROK_DIR = ensure_dir("generated", "grok")

VEO_PAGE_URL = "https://veoaifree.com/veo-video-generator/"
SEEDANCE_PAGE_URL = "https://veoaifree.com/seedance-2-0-video-generator-free/"
PHOTO_VIDEO_PAGE_URL = "https://veoaifree.com/photo-and-image-to-video-generator/"
GROK_PAGE_URL = "https://veoaifree.com/grok-ai-video-generator/"
VEO_AJAX_URL = "https://veoaifree.com/wp-admin/admin-ajax.php"
I2V_POLL_SECONDS = 60  # site JS waits ~40s before first poll for img-to-video

_USER_AGENTS = [
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
    ),
]

_ASPECT_VIDEO = {
    "9:16": "VIDEO_ASPECT_RATIO_PORTRAIT",
    "16:9": "VIDEO_ASPECT_RATIO_LANDSCAPE",
}
_ASPECT_IMAGE = {
    "9:16": "IMAGE_ASPECT_RATIO_PORTRAIT",
    "16:9": "IMAGE_ASPECT_RATIO_LANDSCAPE",
    "1:1": "IMAGE_ASPECT_RATIO_SQUARE",
}


class VeoService:
    def _resolve_ua(self, user_agent: Optional[str] = None) -> str:
        if user_agent and user_agent.strip():
            return user_agent.strip()
        env = os.getenv("VEO_USER_AGENT", "").strip()
        if env:
            return env
        return random.choice(_USER_AGENTS)

    def _bootstrap(
        self,
        user_agent: Optional[str] = None,
        page_url: str = VEO_PAGE_URL,
    ) -> Tuple[requests.Session, str, str]:
        """POST the generator page — same as working veoaifree scripts — to get cookies + nonce."""
        ua = self._resolve_ua(user_agent)
        session = requests.Session()
        try:
            resp = session.post(
                page_url,
                headers={"user-agent": ua},
                timeout=45,
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            raise HTTPException(status_code=502, detail=f"VEO session bootstrap failed: {e}") from e

        match = re.search(r'"nonce":"([^"]+)"', resp.text)
        if not match:
            raise HTTPException(status_code=502, detail="VEO page did not return a nonce.")
        return session, match.group(1), ua

    def _ajax_headers(self, ua: str, referer: str = VEO_PAGE_URL) -> Dict[str, str]:
        mobile = "Mobile" in ua
        return {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "origin": "https://veoaifree.com",
            "priority": "u=1, i",
            "referer": referer,
            "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge";v="127"',
            "sec-ch-ua-mobile": "?1" if mobile else "?0",
            "sec-ch-ua-platform": '"Android"' if mobile else '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent": ua,
            "x-requested-with": "XMLHttpRequest",
        }

    def _ajax_post(
        self,
        session: requests.Session,
        nonce: str,
        ua: str,
        data: Dict[str, str],
        timeout: int = 120,
        referer: str = VEO_PAGE_URL,
    ) -> requests.Response:
        payload = {"action": "veo_video_generator", "nonce": nonce, **data}
        try:
            return session.post(
                VEO_AJAX_URL,
                headers=self._ajax_headers(ua, referer),
                data=payload,
                timeout=timeout,
            )
        except requests.RequestException as e:
            raise HTTPException(status_code=502, detail=f"VEO ajax failed: {e}") from e

    def _ajax_multipart(
        self,
        session: requests.Session,
        nonce: str,
        ua: str,
        fields: Dict[str, str],
        files: Dict[str, Tuple[str, bytes, str]],
        timeout: int = 180,
        referer: str = PHOTO_VIDEO_PAGE_URL,
    ) -> requests.Response:
        """Multipart POST — required for img-to-video-start (img1 file upload)."""
        data = {"action": "veo_video_generator", "nonce": nonce, **fields}
        headers = self._ajax_headers(ua, referer)
        headers.pop("content-type", None)
        try:
            return session.post(
                VEO_AJAX_URL,
                headers=headers,
                data=data,
                files=files,
                timeout=timeout,
            )
        except requests.RequestException as e:
            raise HTTPException(status_code=502, detail=f"VEO multipart ajax failed: {e}") from e

    def _load_image_bytes(self, image_data: str) -> Tuple[bytes, str, str]:
        """Decode scene image from data-URL, http(s) URL, or /storage/ local path."""
        raw = image_data.strip()
        if raw.startswith("data:"):
            header, b64 = raw.split(",", 1)
            mime = "image/png"
            if ";" in header and ":" in header:
                mime = header.split(":", 1)[1].split(";", 1)[0]
            ext = ".png" if "png" in mime else ".jpg" if "jpeg" in mime or "jpg" in mime else ".webp"
            try:
                return base64.b64decode(b64), f"scene{ext}", mime
            except (ValueError, TypeError) as e:
                raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}") from e

        if raw.startswith("http://") or raw.startswith("https://"):
            try:
                resp = requests.get(raw, timeout=60)
                resp.raise_for_status()
            except requests.RequestException as e:
                raise HTTPException(status_code=400, detail=f"Could not fetch image URL: {e}") from e
            ctype = resp.headers.get("content-type", "image/png").split(";")[0]
            ext = ".jpg" if "jpeg" in ctype else ".webp" if "webp" in ctype else ".png"
            return resp.content, f"scene{ext}", ctype

        path_str = raw
        if path_str.startswith("/storage/"):
            path_str = str(STORAGE_ROOT / path_str.removeprefix("/storage/").lstrip("/"))
        elif path_str.startswith("storage/"):
            path_str = str(STORAGE_ROOT / path_str.removeprefix("storage/").lstrip("/"))
        local = Path(path_str) if not Path(path_str).is_absolute() else Path(path_str)
        if not local.is_file():
            local = STORAGE_ROOT / Path(path_str).name
        if not local.is_file():
            raise HTTPException(status_code=400, detail=f"Image file not found: {raw[:120]}")
        suffix = local.suffix.lower() or ".png"
        mime = "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/webp" if suffix == ".webp" else "image/png"
        return local.read_bytes(), f"scene{suffix}", mime

    def _site_error_message(self, body: str) -> Optional[str]:
        """Map veoaifree.com plain-text errors (limits, rate caps) to user-facing messages."""
        raw = body.strip()
        if not raw or raw.isdigit():
            return None
        lower = raw.lower()
        if "limit reached" in lower or "maximum allowance" in lower:
            return (
                "Free tier video limit reached (~2 videos per session/IP). "
                "Wait 24h or try again tomorrow."
            )
        if "rate limit" in lower:
            return (
                "Video rate limit (about 5–6 requests per hour per IP). "
                "Try again later or use Nano for images."
            )
        if len(raw) < 200 and any(k in lower for k in ("error", "failed", "retry", "in progress")):
            if "in progress" in lower:
                return None
            return raw[:200]
        return None

    def _google_error_detail(self, body: str) -> Optional[str]:
        if not body.strip().startswith("{"):
            return None
        try:
            parsed = json.loads(body)
            err = parsed.get("error") if isinstance(parsed, dict) else None
            if isinstance(err, dict) and err.get("code"):
                msg = str(err.get("message", "auth error"))[:160]
                return (
                    f"Cloud image API could not reach Google ({msg}). "
                    "Retry later or use Nano."
                )
        except json.JSONDecodeError:
            pass
        return None

    def _extract_job_id(self, text: str) -> Optional[str]:
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                for key in ("sceneData", "scene_id", "id", "job_id"):
                    if parsed.get(key):
                        return str(parsed[key])
        except (json.JSONDecodeError, TypeError):
            pass
        match = re.search(r"\b(\d{1,12})\b", text)
        return match.group(1) if match else None

    def _parse_media_url(self, text: str) -> Optional[str]:
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                for key in ("video_url", "videoUrl", "url", "image_url", "imageUrl", "download_url"):
                    val = parsed.get(key)
                    if val and isinstance(val, str) and val.startswith("http"):
                        return val
                data = parsed.get("data")
                if isinstance(data, dict):
                    for key in ("video_url", "url", "image_url"):
                        val = data.get(key)
                        if val and isinstance(val, str) and val.startswith("http"):
                            return val
        except (json.JSONDecodeError, TypeError):
            pass
        for match in re.findall(r'https?://[^\s"\'<>]+\.(?:mp4|webm|png|jpg|jpeg|webp)', text, re.I):
            return match
        return None

    def _parse_banan_image_response(self, text: str) -> Optional[bytes]:
        """Image tab returns comma-separated base64 PNG chunks."""
        raw = text.strip()
        if not raw or raw.lower().startswith("<!doctype"):
            return None
        if raw.startswith("{"):
            return None

        chunk = raw.split(",")[0].strip()
        if ";base64," in chunk:
            chunk = chunk.split(";base64,", 1)[1]
        if len(chunk) < 80:
            return None
        try:
            return base64.b64decode(chunk, validate=False)
        except (ValueError, TypeError):
            return None

    def _persist_bytes(
        self, content: bytes, ext: str = ".png", *, subdir: str = "veo"
    ) -> tuple[str, str]:
        file_id = uuid.uuid4().hex[:12]
        out_dir = ensure_dir("generated", subdir)
        local_path = out_dir / f"{file_id}{ext}"
        local_path.write_bytes(content)
        rel = f"/storage/generated/{subdir}/{file_id}{ext}"
        return rel, str(local_path)

    def _normalize_remote_url(self, remote_url: str) -> str:
        url = (remote_url or "").strip()
        if not url:
            raise ValueError("empty remote url")
        if url.startswith("http://") or url.startswith("https://"):
            return url.replace("videos/", "video/")
        return f"https://veoaifree.com/{url.lstrip('/')}".replace("videos/", "video/")

    @staticmethod
    def _is_video_bytes(content: bytes) -> bool:
        if len(content) < 16:
            return False
        if content[:4] == b"\x1aE\xdf\xa3":
            return True
        return len(content) > 8 and content[4:8] == b"ftyp"

    @staticmethod
    def _is_image_bytes(content: bytes) -> bool:
        if len(content) < 12:
            return False
        if content[:8] == b"\x89PNG\r\n\x1a\n":
            return True
        if content[:3] == b"\xff\xd8\xff":
            return True
        if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
            return True
        return False

    def _persist_remote(
        self,
        remote_url: str,
        kind: str,
        *,
        session: Optional[requests.Session] = None,
        ua: Optional[str] = None,
        referer: Optional[str] = None,
        subdir: str = "veo",
    ) -> tuple[str, str]:
        url = self._normalize_remote_url(remote_url)
        headers = {
            "User-Agent": ua or random.choice(_USER_AGENTS),
            "Accept": "video/mp4,video/*,*/*" if kind == "video" else "image/*,*/*",
            "Referer": referer or VEO_PAGE_URL,
        }
        getter = session.get if session else requests.get
        resp = getter(url, headers=headers, timeout=180, allow_redirects=True)
        resp.raise_for_status()
        content = resp.content or b""
        if len(content) < 500:
            raise requests.RequestException(
                f"Downloaded {kind} too small ({len(content)} bytes) from {url[:120]}"
            )
        if kind == "video" and not self._is_video_bytes(content):
            ctype = (resp.headers.get("content-type") or "").lower()
            if "video" not in ctype and "octet-stream" not in ctype:
                raise requests.RequestException(
                    f"URL did not return video (content-type={ctype or 'unknown'})"
                )
        if kind == "image" and not self._is_image_bytes(content):
            ctype = (resp.headers.get("content-type") or "").lower()
            if "image" not in ctype:
                raise requests.RequestException(
                    f"URL did not return image (content-type={ctype or 'unknown'})"
                )

        ext = ".mp4" if kind == "video" else ".png"
        path_part = url.split("?")[0].rsplit("/", 1)[-1]
        if "." in path_part:
            candidate = "." + path_part.rsplit(".", 1)[-1].lower()[:4]
            if candidate in (".mp4", ".webm", ".png", ".jpg", ".webp"):
                ext = ".jpg" if candidate == ".jpg" else candidate
        file_id = uuid.uuid4().hex[:12]
        out_dir = ensure_dir("generated", subdir) if subdir != "veo" else _VIDEOS_DIR
        local_path = out_dir / f"{file_id}{ext}"
        local_path.write_bytes(content)
        rel = f"/storage/generated/{subdir}/{file_id}{ext}"
        logger.info("Persisted %s (%d bytes) → %s", kind, len(content), rel)
        return rel, str(local_path)

    def _persist_video_or_raise(
        self,
        remote_url: str,
        *,
        session: requests.Session,
        ua: str,
        referer: str,
    ) -> tuple[str, str]:
        try:
            return self._persist_remote(
                remote_url, "video", session=session, ua=ua, referer=referer
            )
        except requests.RequestException as exc:
            logger.warning("VEO video download failed (remote=%s): %s", remote_url[:160], exc)
            raise HTTPException(
                status_code=502,
                detail=(
                    "Video was generated on VEO but could not be downloaded for playback. "
                    f"{exc}. Try again — the clip may still be within your daily limit."
                ),
            ) from exc

    def _poll_result(
        self,
        session: requests.Session,
        nonce: str,
        ua: str,
        job_id: str,
        poll_seconds: int = 85,
        max_attempts: int = 8,
        referer: str = VEO_PAGE_URL,
    ) -> str:
        # Site JS waits ~85s before first poll, then retries every ~20s on empty body.
        initial_wait = max(60, min(poll_seconds, 120))
        retry_wait = 20
        time.sleep(initial_wait)
        last_body = ""
        for attempt in range(max_attempts):
            resp = self._ajax_post(
                session,
                nonce,
                ua,
                {"actionType": "final-video-results", "sceneData": job_id},
                timeout=120,
                referer=referer,
            )
            last_body = resp.text.strip()
            site_err = self._site_error_message(last_body)
            if site_err:
                raise HTTPException(status_code=429, detail=f"VEO video failed: {site_err}")
            if not last_body:
                time.sleep(retry_wait)
                continue
            media = self._parse_media_url(last_body)
            if media:
                return media
            # Bare URL path returned (site replaces videos/ → video/)
            if last_body.startswith("http") or "video" in last_body.lower():
                url = last_body if last_body.startswith("http") else f"https://veoaifree.com/{last_body.lstrip('/')}"
                return url.replace("videos/", "video/")
            time.sleep(retry_wait)
        raise HTTPException(
            status_code=504,
            detail=f"VEO poll timed out for job {job_id}. Last response: {last_body[:300]}",
        )

    def _grok_video_modal(self, model: str) -> str:
        m = (model or "").lower()
        if "4.5" in m or "4-5" in m:
            return "Grok 4.5"
        return "Grok 4"

    def _grok_prompt_modal(self, model: str) -> str:
        m = (model or "").lower()
        if "4.5" in m or "4-5" in m:
            return "Grok 4.5"
        return "Grok AI 4.0"

    async def generate_prompt(
        self,
        idea: str,
        user_agent: Optional[str] = None,
        provider: str = "veo",
        grok_model: str = "grok-ai-4.0",
    ) -> Dict[str, Any]:
        use_grok = provider.lower() in ("grok", "grok-ai", "xai")
        page_url = GROK_PAGE_URL if use_grok else VEO_PAGE_URL
        session, nonce, ua = self._bootstrap(user_agent, page_url=page_url)
        payload: Dict[str, str] = {
            "actionType": "main-prompt-generation",
            "prompt": idea.strip(),
        }
        if use_grok:
            payload["modal"] = self._grok_prompt_modal(grok_model)
        resp = self._ajax_post(
            session,
            nonce,
            ua,
            payload,
            timeout=90,
            referer=page_url,
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=f"VEO prompt error: {resp.text[:300]}")
        text = resp.text.strip()
        site_err = self._site_error_message(text)
        if site_err:
            raise HTTPException(status_code=429, detail=f"VEO prompt failed: {site_err}")
        if not text:
            raise HTTPException(status_code=502, detail="VEO prompt generator returned empty response.")
        return {
            "prompt": text,
            "engine": "grok-prompt" if use_grok else "veo-prompt",
            "metadata": {
                "model": payload.get("modal") if use_grok else "gemini-veo-tab",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }

    def _whisk_final_image(
        self,
        prompt: str,
        aspect_ratio: str,
        user_agent: Optional[str],
        page_url: str,
        *,
        engine: str,
        model: str,
        storage_subdir: str,
        max_retries: int = 2,
    ) -> Dict[str, Any]:
        """whisk_final_image — fast base64 PNG (~10s). Used on Seedance + Grok image tabs."""
        session, nonce, ua = self._bootstrap(user_agent, page_url=page_url)
        payload = {
            "actionType": "whisk_final_image",
            "promptText": prompt.strip(),
            "totalImages": "1",
            "ratio": _ASPECT_IMAGE.get(aspect_ratio, "IMAGE_ASPECT_RATIO_PORTRAIT"),
        }

        last_error = ""
        for attempt in range(max_retries + 1):
            resp = self._ajax_post(session, nonce, ua, payload, timeout=180, referer=page_url)
            if resp.status_code >= 400:
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=f"Whisk image error: {resp.text[:300]}",
                )
            body = resp.text.strip()
            try:
                parsed = json.loads(body)
            except json.JSONDecodeError:
                last_error = body[:200]
                time.sleep(3)
                continue

            data_uri = parsed.get("data_uri", "") if isinstance(parsed, dict) else ""
            success = (
                str(parsed.get("success", "")).lower() == "true"
                if isinstance(parsed, dict)
                else False
            )
            if success and data_uri.startswith("data:image"):
                b64 = data_uri.split(",", 1)[1]
                image_bytes = base64.b64decode(b64)
                image_url, image_path = self._persist_bytes(image_bytes, subdir=storage_subdir)
                return {
                    "image_url": image_url,
                    "image_path": image_path,
                    "engine": engine,
                    "metadata": {
                        "prompt_used": prompt,
                        "aspect_ratio": aspect_ratio,
                        "model": model,
                        "format": "base64-inline",
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    },
                }
            last_error = (
                str(parsed.get("error", body[:200])) if isinstance(parsed, dict) else body[:200]
            )
            time.sleep(3)

        raise HTTPException(
            status_code=502,
            detail=f"Whisk image failed after {max_retries + 1} attempts: {last_error}",
        )

    async def generate_grok_image(
        self,
        prompt: str,
        aspect_ratio: str = "9:16",
        user_agent: Optional[str] = None,
        poll_seconds: int = 45,
        image_model: str = "Grok 4",
    ) -> Dict[str, Any]:
        """Grok image tab — whisk_final_image on grok-ai-video-generator/ (same API as Seedance whisk)."""
        del poll_seconds, image_model  # whisk returns inline base64; no modal/poll
        return self._whisk_final_image(
            prompt,
            aspect_ratio,
            user_agent,
            GROK_PAGE_URL,
            engine="grok-image",
            model="whisk-grok",
            storage_subdir="grok",
        )

    async def generate_image(
        self,
        prompt: str,
        aspect_ratio: str = "9:16",
        user_agent: Optional[str] = None,
        poll_seconds: int = 45,
        image_model: str = "IMAGEN 4",
    ) -> Dict[str, Any]:
        session, nonce, ua = self._bootstrap(user_agent)
        payload: Dict[str, str] = {
            "actionType": "banan-image-generator",
            "promptIMG": prompt.strip(),
            "aspectRatioIMG": _ASPECT_IMAGE.get(aspect_ratio, "IMAGE_ASPECT_RATIO_PORTRAIT"),
            "totalVariationsIMG": "1",
        }
        if image_model:
            payload["modal2"] = image_model

        resp = self._ajax_post(session, nonce, ua, payload, timeout=180)
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=f"VEO image error: {resp.text[:300]}")

        body = resp.text
        site_err = self._site_error_message(body)
        if site_err:
            raise HTTPException(status_code=429, detail=f"VEO image failed: {site_err}")
        google_err = self._google_error_detail(body)
        if google_err:
            raise HTTPException(status_code=502, detail=f"VEO image failed: {google_err}")

        image_bytes = self._parse_banan_image_response(body)
        if image_bytes:
            image_url, image_path = self._persist_bytes(image_bytes)
            return {
                "image_url": image_url,
                "image_path": image_path,
                "engine": "veo-image",
                "metadata": {
                    "prompt_used": prompt,
                    "aspect_ratio": aspect_ratio,
                    "model": image_model or "nano-banana-via-veo",
                    "format": "base64-inline",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                },
            }

        job_id = self._extract_job_id(body)
        remote = self._parse_media_url(body)
        if not remote and job_id:
            remote = self._poll_result(session, nonce, ua, job_id, poll_seconds=poll_seconds)
        if not remote:
            raise HTTPException(status_code=502, detail=f"VEO image failed: {body[:300]}")

        try:
            image_url, image_path = self._persist_remote(
                remote, "image", session=session, ua=ua, referer=page_url
            )
        except requests.RequestException as exc:
            logger.warning("VEO image download failed: %s", exc)
            image_url, image_path = remote, ""

        return {
            "image_url": image_url,
            "image_path": image_path,
            "engine": "veo-image",
            "metadata": {
                "prompt_used": prompt,
                "aspect_ratio": aspect_ratio,
                "model": image_model or "nano-banana-via-veo",
                "remote_url": remote,
                "job_id": job_id,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }

    def _resolve_video_route(self, veo_model: str) -> Tuple[str, str, str]:
        """Return (engine_family, modal label, bootstrap page URL)."""
        m = (veo_model or "").lower()
        if "grok" in m:
            return "grok", self._grok_video_modal(veo_model), GROK_PAGE_URL
        if "seedance" in m:
            modal = "Seedance 2.0" if "2" in veo_model else "Seedance"
            return "seedance", modal, SEEDANCE_PAGE_URL
        return "veo", veo_model, VEO_PAGE_URL

    async def generate_image_to_video(
        self,
        prompt: str,
        image_data: str,
        aspect_ratio: str = "9:16",
        user_agent: Optional[str] = None,
        poll_seconds: int = I2V_POLL_SECONDS,
        veo_model: str = "3.1",
        variations: int = 1,
    ) -> Dict[str, Any]:
        """Photo-to-video — scene still + animation prompt (veoaifree Image to Video tab)."""
        text = prompt.strip()
        if len(text) < 10:
            raise HTTPException(
                status_code=400,
                detail="Animation prompt must be at least 10 characters.",
            )

        if "seedance" in (veo_model or "").lower() or "grok" in (veo_model or "").lower():
            raise HTTPException(
                status_code=400,
                detail="Photo-to-video uses VEO 3.1/2.0 only. Pick a VEO model or use Grok/Seedance as text-to-video without an image.",
            )

        image_bytes, filename, mime = self._load_image_bytes(image_data)
        page_url = PHOTO_VIDEO_PAGE_URL

        session, nonce, ua = self._bootstrap(user_agent, page_url=page_url)
        fields: Dict[str, str] = {
            "actionType": "img-to-video-start",
            "prompt": text,
            "totalVariations": str(max(1, min(variations, 4))),
            "aspectRatio": _ASPECT_VIDEO.get(aspect_ratio, "VIDEO_ASPECT_RATIO_PORTRAIT"),
        }

        resp = self._ajax_multipart(
            session,
            nonce,
            ua,
            fields,
            files={"img1": (filename, image_bytes, mime)},
            referer=page_url,
        )
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Photo-to-video start error: {resp.text[:300]}",
            )

        body = resp.text
        site_err = self._site_error_message(body)
        if site_err:
            raise HTTPException(status_code=429, detail=f"Photo-to-video failed: {site_err}")
        google_err = self._google_error_detail(body)
        if google_err:
            raise HTTPException(status_code=502, detail=f"Photo-to-video failed: {google_err}")

        job_id = self._extract_job_id(body)
        if not job_id:
            raise HTTPException(status_code=502, detail=f"Photo-to-video missing job id: {body[:300]}")

        poll = max(40, min(poll_seconds, 120))
        remote = self._poll_result(
            session, nonce, ua, job_id, poll_seconds=poll, referer=page_url
        )
        video_url, video_path = self._persist_video_or_raise(
            remote, session=session, ua=ua, referer=page_url
        )

        model_label = f"google-veo-{veo_model}"
        return {
            "success": True,
            "video_url": video_url,
            "video_path": video_path,
            "engine": "veo3-i2v",
            "metadata": {
                "prompt_used": prompt,
                "aspect_ratio": aspect_ratio,
                "model": model_label,
                "veo_model": veo_model,
                "mode": "image-to-video",
                "remote_url": remote,
                "job_id": job_id,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }

    async def generate_video(
        self,
        prompt: str,
        aspect_ratio: str = "9:16",
        user_agent: Optional[str] = None,
        poll_seconds: int = 85,
        veo_model: str = "3.1",
        variations: int = 1,
        image_data: Optional[str] = None,
    ) -> Dict[str, Any]:
        if image_data and image_data.strip():
            return await self.generate_image_to_video(
                prompt=prompt,
                image_data=image_data,
                aspect_ratio=aspect_ratio,
                user_agent=user_agent,
                poll_seconds=poll_seconds or I2V_POLL_SECONDS,
                veo_model=veo_model,
                variations=variations,
            )

        text = prompt.strip()
        if len(text) < 15:
            raise HTTPException(
                status_code=400,
                detail="VEO video prompt must be at least 15 characters.",
            )

        family, modal, page_url = self._resolve_video_route(veo_model)

        session, nonce, ua = self._bootstrap(user_agent, page_url=page_url)
        payload: Dict[str, str] = {
            "actionType": "full-video-generate",
            "prompt": text,
            "totalVariations": str(max(1, min(variations, 4))),
            "aspectRatio": _ASPECT_VIDEO.get(aspect_ratio, "VIDEO_ASPECT_RATIO_PORTRAIT"),
        }
        if modal:
            payload["modal"] = modal

        err_prefix = "Grok video" if family == "grok" else "VEO video"
        resp = self._ajax_post(session, nonce, ua, payload, timeout=120, referer=page_url)
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=f"{err_prefix} start error: {resp.text[:300]}")

        body = resp.text
        site_err = self._site_error_message(body)
        if site_err:
            raise HTTPException(status_code=429, detail=f"{err_prefix} failed: {site_err}")
        google_err = self._google_error_detail(body)
        if google_err:
            raise HTTPException(status_code=502, detail=f"{err_prefix} failed: {google_err}")

        job_id = self._extract_job_id(body)
        if not job_id:
            raise HTTPException(status_code=502, detail=f"{err_prefix} missing job id: {body[:300]}")

        remote = self._poll_result(
            session, nonce, ua, job_id, poll_seconds=poll_seconds, referer=page_url
        )
        if family == "grok":
            try:
                resp_dl = session.get(
                    self._normalize_remote_url(remote),
                    headers={
                        "User-Agent": ua,
                        "Referer": page_url,
                        "Accept": "video/mp4,video/*,*/*",
                    },
                    timeout=180,
                )
                resp_dl.raise_for_status()
                if not self._is_video_bytes(resp_dl.content or b""):
                    raise requests.RequestException("Grok response was not a valid video file")
                file_id = uuid.uuid4().hex[:12]
                local_path = _GROK_DIR / f"{file_id}.mp4"
                local_path.write_bytes(resp_dl.content)
                video_url = f"/storage/generated/grok/{file_id}.mp4"
                video_path = str(local_path)
            except requests.RequestException as exc:
                logger.warning("Grok video download failed: %s", exc)
                raise HTTPException(
                    status_code=502,
                    detail=f"Grok video was generated but could not be saved: {exc}",
                ) from exc
        else:
            video_url, video_path = self._persist_video_or_raise(
                remote, session=session, ua=ua, referer=page_url
            )

        if family == "grok":
            model_label = modal
            engine_out = "grok"
        elif family == "seedance":
            model_label = modal
            engine_out = "seedance"
        else:
            model_label = f"google-veo-{veo_model}"
            engine_out = "veo3"
        return {
            "success": True,
            "video_url": video_url,
            "video_path": video_path,
            "engine": engine_out,
            "metadata": {
                "prompt_used": prompt,
                "aspect_ratio": aspect_ratio,
                "model": model_label,
                "veo_model": veo_model,
                "mode": "text-to-video",
                "remote_url": remote,
                "job_id": job_id,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }

    async def generate_whisk_image(
        self,
        prompt: str,
        aspect_ratio: str = "9:16",
        user_agent: Optional[str] = None,
        max_retries: int = 2,
    ) -> Dict[str, Any]:
        """Seedance 2.0 image tab — whisk_final_image (~10s, base64 PNG)."""
        return self._whisk_final_image(
            prompt,
            aspect_ratio,
            user_agent,
            SEEDANCE_PAGE_URL,
            engine="seedance-image",
            model="whisk-seedance",
            storage_subdir="veo",
            max_retries=max_retries,
        )


veo_service = VeoService()
