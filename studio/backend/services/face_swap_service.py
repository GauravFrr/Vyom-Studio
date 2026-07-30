"""
Insta AI influencer — face copy (image) and face swap (video).

Priority:
  1. Kaggle GPU tunnel  POST /face-swap/image | /face-swap/video
  2. Durex dual-image POST (scene + face reference files)
  3. Durex single-image fallback with face-swap prompt on scene
"""
from __future__ import annotations

import base64
import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

import requests
from fastapi import HTTPException

from services.durex_service import durex_service
from storage_paths import STORAGE_ROOT, ensure_dir

logger = logging.getLogger(__name__)

_IMAGE_OUT = ensure_dir("generated", "face-swap")
_VIDEO_OUT = _IMAGE_OUT

FACE_SWAP_IMAGE_PROMPT = (
    "Face swap for Instagram influencer content. Replace ONLY the face in the scene "
    "photo with the exact face identity from the reference model photo. Keep pose, "
    "body, outfit, hair, background, lighting, and composition from the scene. "
    "Photorealistic seamless blend, no artifacts, natural skin tones."
)


class FaceSwapService:
    def _kaggle_url(self, override: Optional[str] = None) -> Optional[str]:
        url = (override or os.getenv("KAGGLE_TUNNEL_URL") or "").strip()
        return url.rstrip("/") if url else None

    def _download_to_storage(
        self,
        remote_url: str,
        *,
        subdir: str,
        ext: str,
    ) -> Tuple[str, str]:
        resp = requests.get(remote_url, timeout=180)
        resp.raise_for_status()
        file_id = uuid.uuid4().hex[:12]
        folder = _STORAGE_ROOT / "generated" / subdir
        folder.mkdir(parents=True, exist_ok=True)
        local_path = folder / f"{file_id}.{ext}"
        local_path.write_bytes(resp.content)
        rel = f"/storage/generated/{subdir}/{file_id}.{ext}"
        return rel, str(local_path)

    def _save_bytes(self, data: bytes, *, subdir: str, ext: str) -> str:
        file_id = uuid.uuid4().hex[:12]
        folder = _STORAGE_ROOT / "generated" / subdir
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{file_id}.{ext}"
        path.write_bytes(data)
        return f"/storage/generated/{subdir}/{file_id}.{ext}"

    async def _try_kaggle_image(
        self,
        scene_bytes: bytes,
        face_bytes: bytes,
        kaggle_url: str,
        notes: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        payload = {
            "scene_base64": base64.b64encode(scene_bytes).decode("ascii"),
            "face_base64": base64.b64encode(face_bytes).decode("ascii"),
            "notes": notes or "",
        }
        try:
            resp = requests.post(f"{kaggle_url}/face-swap/image", json=payload, timeout=600)
        except requests.RequestException as e:
            logger.warning("Kaggle face-swap image unreachable: %s", e)
            return None
        if resp.status_code == 501:
            return None
        if resp.status_code >= 400:
            logger.warning("Kaggle face-swap image error %s: %s", resp.status_code, resp.text[:200])
            return None
        data = resp.json()
        if not data.get("success"):
            return None
        image_url = data.get("image_url")
        if image_url and image_url.startswith("http"):
            image_url, _ = self._download_to_storage(image_url, subdir="face-swap", ext="jpg")
        return {
            "success": True,
            "image_url": image_url,
            "engine": "kaggle-face-swap",
            "metadata": {
                "mode": "face-copy-image",
                "provider": "kaggle",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }

    async def _try_kaggle_video(
        self,
        video_bytes: bytes,
        face_bytes: bytes,
        kaggle_url: str,
        notes: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        payload = {
            "video_base64": base64.b64encode(video_bytes).decode("ascii"),
            "face_base64": base64.b64encode(face_bytes).decode("ascii"),
            "notes": notes or "",
        }
        try:
            resp = requests.post(f"{kaggle_url}/face-swap/video", json=payload, timeout=900)
        except requests.RequestException as e:
            logger.warning("Kaggle face-swap video unreachable: %s", e)
            return None
        if resp.status_code == 501:
            return None
        if resp.status_code >= 400:
            logger.warning("Kaggle face-swap video error %s: %s", resp.status_code, resp.text[:200])
            return None
        data = resp.json()
        if not data.get("success"):
            return None
        video_url = data.get("video_url")
        if video_url and video_url.startswith("http"):
            video_url, _ = self._download_to_storage(video_url, subdir="face-swap", ext="mp4")
        return {
            "success": True,
            "video_url": video_url,
            "engine": "kaggle-face-swap",
            "metadata": {
                "mode": "face-swap-video",
                "provider": "kaggle",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }

    async def _try_durex_dual(
        self,
        scene_bytes: bytes,
        face_bytes: bytes,
        *,
        api_key: Optional[str],
        base_url: Optional[str],
        proxy: Optional[str],
        notes: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        """Try Durex with scene + face as two multipart files."""
        params: Dict[str, str] = {"key": durex_service._api_key(api_key)}
        if proxy and proxy.strip():
            params["proxy"] = proxy.strip()
        url = durex_service._base_url(base_url)
        prompt = FACE_SWAP_IMAGE_PROMPT
        if notes and notes.strip():
            prompt = f"{prompt} Additional notes: {notes.strip()}"

        file_sets = [
            {"image": ("scene.jpg", scene_bytes, "image/jpeg"), "reference": ("face.jpg", face_bytes, "image/jpeg")},
            {"image": ("scene.jpg", scene_bytes, "image/jpeg"), "face": ("face.jpg", face_bytes, "image/jpeg")},
            {"image": ("scene.jpg", scene_bytes, "image/jpeg"), "image2": ("face.jpg", face_bytes, "image/jpeg")},
        ]
        for files in file_sets:
            try:
                resp = requests.post(
                    url,
                    params=params,
                    files=files,
                    data={"prompt": prompt},
                    timeout=300,
                )
            except requests.RequestException:
                continue
            if resp.status_code >= 400:
                continue
            try:
                payload = resp.json()
            except ValueError:
                continue
            if not payload.get("success") or not payload.get("download_url"):
                continue
            try:
                image_url, image_path = durex_service._download_to_storage(payload["download_url"])
            except requests.RequestException:
                image_url = payload["download_url"]
                image_path = ""
            return {
                "success": True,
                "image_url": image_url,
                "image_path": image_path,
                "engine": "durex-face-swap",
                "metadata": {
                    "mode": "face-copy-image",
                    "provider": "durex-dual",
                    "prompt_used": prompt,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                },
            }
        return None

    async def copy_face_image(
        self,
        scene_bytes: bytes,
        face_bytes: bytes,
        *,
        scene_filename: str = "scene.jpg",
        face_filename: str = "face.jpg",
        notes: Optional[str] = None,
        kaggle_tunnel_url: Optional[str] = None,
        durex_api_key: Optional[str] = None,
        durex_api_url: Optional[str] = None,
        durex_proxy: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not scene_bytes:
            raise HTTPException(status_code=400, detail="Scene image is empty.")
        if not face_bytes:
            raise HTTPException(status_code=400, detail="Model face image is empty.")

        kaggle = self._kaggle_url(kaggle_tunnel_url)
        if kaggle:
            result = await self._try_kaggle_image(scene_bytes, face_bytes, kaggle, notes)
            if result:
                return result

        dual = await self._try_durex_dual(
            scene_bytes,
            face_bytes,
            api_key=durex_api_key,
            base_url=durex_api_url,
            proxy=durex_proxy,
            notes=notes,
        )
        if dual:
            return dual

        prompt = FACE_SWAP_IMAGE_PROMPT
        if notes and notes.strip():
            prompt = f"{prompt} {notes.strip()}"
        return await durex_service.transform_image(
            image_bytes=scene_bytes,
            prompt=prompt,
            filename=scene_filename,
            api_key=durex_api_key,
            base_url=durex_api_url,
            proxy=durex_proxy,
        )

    async def swap_face_video(
        self,
        video_bytes: bytes,
        face_bytes: bytes,
        *,
        notes: Optional[str] = None,
        kaggle_tunnel_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not video_bytes:
            raise HTTPException(status_code=400, detail="Reference video is empty.")
        if not face_bytes:
            raise HTTPException(status_code=400, detail="Model face image is empty.")

        kaggle = self._kaggle_url(kaggle_tunnel_url)
        if kaggle:
            result = await self._try_kaggle_video(video_bytes, face_bytes, kaggle, notes)
            if result:
                return result

        raise HTTPException(
            status_code=503,
            detail=(
                "Video face swap requires a Kaggle GPU tunnel. "
                "Start the Kaggle notebook with face-swap endpoints and set KAGGLE_TUNNEL_URL "
                "in Settings → API Keys."
            ),
        )


face_swap_service = FaceSwapService()
