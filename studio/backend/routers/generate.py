from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from core.errors import http_error
from dependencies.auth import get_current_user, get_verified_user
from models.database import User
from models.db import get_db
from services.gemini_service import gemini_service
from services.nano_banana_service import nano_banana_service
from services.veo_service import veo_service
from services.tts_service import tts_service
from services import user_media as um
from services.usage_limiter import check_quota, extract_limits_from_body, record_use
from routers.usage_limits_mixin import UsageLimitsMixin
from datetime import datetime
import os
import requests

router = APIRouter(dependencies=[Depends(get_verified_user)])


def _public_media_response(
    db: Session,
    user: User,
    result: Dict[str, Any],
    *,
    kind: str,
    engine: str,
    extra_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = dict(result)
    payload["success"] = True
    payload["engine"] = engine
    if extra_meta:
        payload["metadata"] = {**(payload.get("metadata") or {}), **extra_meta}
    adopted = um.adopt_generation_result(db, user.id, payload, kind=kind, engine=engine)
    for key in ("image_path", "video_path", "audio_path", "file_path"):
        adopted.pop(key, None)
    return adopted


class ImageGenerationRequest(UsageLimitsMixin, BaseModel):
    prompt: str
    negative_prompt: Optional[str] = None
    engine: Optional[str] = "nano"  # imagen3 | flux | nano | veo-image
    style: Optional[str] = "cinematic"
    aspect_ratio: Optional[str] = "9:16"
    resolution: Optional[str] = "1024"
    project_id: Optional[str] = None
    scene_id: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    nano_api_key: Optional[str] = None
    nano_api_url: Optional[str] = None
    veo_poll_seconds: Optional[int] = None
    veo_user_agent: Optional[str] = None
    veo_image_model: Optional[str] = None  # IMAGEN 4 — veoaifree #modal2


class VideoGenerationRequest(UsageLimitsMixin, BaseModel):
    prompt: Optional[str] = None
    motion_prompt: Optional[str] = None
    image: Optional[str] = None
    image_url: Optional[str] = None
    engine: Optional[str] = "veo3"
    style: Optional[str] = "cinematic"
    duration_seconds: Optional[int] = 4
    aspect_ratio: Optional[str] = "9:16"
    resolution: Optional[str] = "1024"
    camera_movement: Optional[str] = None
    motion_intensity: Optional[float] = None
    fps: Optional[int] = None
    loop: Optional[bool] = False
    seed: Optional[str] = None
    project_id: Optional[str] = None
    scene_id: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    kaggle_tunnel_url: Optional[str] = None
    veo_poll_seconds: Optional[int] = None
    veo_user_agent: Optional[str] = None
    veo_model: Optional[str] = "3.1"  # 3.1 | 2.0 (veoaifree.com #modal)


class TTSRequest(UsageLimitsMixin, BaseModel):
    text: str
    voice: Optional[str] = "hi-IN-MadhurNeural"
    lang: Optional[str] = "hi-IN"
    speed: Optional[float] = 1.0
    pitch: Optional[int] = 0
    emotion: Optional[str] = "default"
    veo_user_agent: Optional[str] = None


class PromptEnhanceRequest(UsageLimitsMixin, BaseModel):
    idea: str
    engine: Optional[str] = "veo"  # veo | grok | tokenlb (future)
    grok_model: Optional[str] = "grok-ai-4.0"
    veo_poll_seconds: Optional[int] = None
    veo_user_agent: Optional[str] = None


def _kaggle_base_url(override: Optional[str] = None) -> str:
    tunnel_url = override or os.getenv("KAGGLE_TUNNEL_URL")
    if tunnel_url:
        return tunnel_url.rstrip("/")
    return "http://localhost:8001"


def _video_prompt(request: VideoGenerationRequest) -> str:
    text = (request.motion_prompt or request.prompt or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="motion_prompt or prompt is required.")
    if request.camera_movement and request.camera_movement != "static":
        text = f"{text}, camera movement: {request.camera_movement}"
    duration = request.duration_seconds
    if duration and 4 <= duration <= 6:
        text = f"{text}. Target clip length: {duration} seconds."
    aspect = (request.aspect_ratio or "").strip()
    if aspect == "9:16":
        text = f"{text} Vertical 9:16 YouTube Shorts format."
    elif aspect == "16:9":
        text = f"{text} Horizontal 16:9 landscape format."
    return text


@router.post("/image")
async def generate_image(
    request: ImageGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate an image — Nano Banana (free), VEO/Nano tab, Imagen 3, or FLUX."""
    try:
        limits = extract_limits_from_body(request)
        engine = (request.engine or "nano").lower()

        if engine in ("nano", "nano-banana", "nanobanana"):
            check_quota("nano", limits)
            result = await nano_banana_service.generate_image(
                prompt=request.prompt,
                style=request.style,
                aspect_ratio=request.aspect_ratio,
                api_key=request.nano_api_key,
                base_url=request.nano_api_url,
            )
            meta = result.get("metadata", {})
            record_use("nano")
            return _public_media_response(
                db, current_user, result, kind="image", engine="nano-banana",
            )

        if engine in ("grok-image", "grok_image", "grok-img"):
            check_quota("veo", limits)
            try:
                result = await veo_service.generate_grok_image(
                    prompt=request.prompt,
                    aspect_ratio=request.aspect_ratio or "9:16",
                    user_agent=request.veo_user_agent,
                    image_model=request.veo_image_model or "Grok 4",
                )
                record_use("veo")
                return _public_media_response(
                    db, current_user, result, kind="image", engine="grok-image",
                )
            except HTTPException:
                check_quota("nano", limits)
                result = await nano_banana_service.generate_image(
                    prompt=request.prompt,
                    style=request.style,
                    aspect_ratio=request.aspect_ratio,
                    api_key=request.nano_api_key,
                    base_url=request.nano_api_url,
                )
                record_use("nano")
                return _public_media_response(
                    db, current_user, result, kind="image", engine="grok-image",
                    extra_meta={"provider_fallback_used": True, "fallback_reason": "Used alternate image service"},
                )

        if engine in ("seedance-image", "seedance_image", "seedance", "whisk"):
            check_quota("veo", limits)
            try:
                result = await veo_service.generate_whisk_image(
                    prompt=request.prompt,
                    aspect_ratio=request.aspect_ratio or "9:16",
                    user_agent=request.veo_user_agent,
                )
                record_use("veo")
                return _public_media_response(
                    db, current_user, result, kind="image", engine="seedance-image",
                )
            except HTTPException:
                check_quota("nano", limits)
                result = await nano_banana_service.generate_image(
                    prompt=request.prompt,
                    style=request.style,
                    aspect_ratio=request.aspect_ratio,
                    api_key=request.nano_api_key,
                    base_url=request.nano_api_url,
                )
                record_use("nano")
                return _public_media_response(
                    db, current_user, result, kind="image", engine="seedance-image",
                    extra_meta={"provider_fallback_used": True, "fallback_reason": "Used alternate image service"},
                )

        if engine in ("veo-image", "veo_image", "veo"):
            check_quota("veo", limits)
            try:
                result = await veo_service.generate_image(
                    prompt=request.prompt,
                    aspect_ratio=request.aspect_ratio or "9:16",
                    user_agent=request.veo_user_agent,
                    image_model=request.veo_image_model or "IMAGEN 4",
                )
                record_use("veo")
                return _public_media_response(
                    db, current_user, result, kind="image", engine="veo-image",
                )
            except HTTPException:
                check_quota("nano", limits)
                result = await nano_banana_service.generate_image(
                    prompt=request.prompt,
                    style=request.style,
                    aspect_ratio=request.aspect_ratio,
                    api_key=request.nano_api_key,
                    base_url=request.nano_api_url,
                )
                record_use("nano")
                return _public_media_response(
                    db, current_user, result, kind="image", engine="veo-image",
                    extra_meta={"provider_fallback_used": True, "fallback_reason": "Used alternate image service"},
                )

        if request.engine in ("imagen3", "imagen4", "imagen"):
            result = await gemini_service.generate_image(
                prompt=request.prompt,
                negative_prompt=request.negative_prompt,
                aspect_ratio=request.aspect_ratio,
                resolution=request.resolution,
                style=request.style,
                api_key=request.google_api_key,
            )
            meta = result.get("metadata", {})
            return _public_media_response(
                db,
                current_user,
                result,
                kind="image",
                engine="imagen4",
                extra_meta={
                    "prompt_used": meta.get("prompt_used"),
                    "aspect_ratio": meta.get("aspect_ratio"),
                    "resolution": meta.get("resolution"),
                    "style": meta.get("style"),
                    "timestamp": meta.get("timestamp") or datetime.utcnow().isoformat() + "Z",
                },
            )

        if request.engine in ("flux", "flux.1", "FLUX.1"):
            kaggle_url = _kaggle_base_url(override=request.kaggle_tunnel_url)
            payload = request.model_dump()
            try:
                resp = requests.post(f"{kaggle_url}/generate/image", json=payload, timeout=300)
            except requests.RequestException as exc:
                raise http_error(502, "Remote image service is unavailable.") from exc

            if resp.status_code >= 400:
                raise http_error(502, "Remote image service returned an error.")

            data = resp.json()
            return _public_media_response(
                db,
                current_user,
                {
                    "image_url": data.get("image_url"),
                    "image_path": data.get("image_path"),
                    "metadata": data.get("metadata", {"timestamp": datetime.now().isoformat()}),
                    "job_id": data.get("job_id"),
                },
                kind="image",
                engine="flux",
            )

        raise http_error(400, "That image engine is not supported.")

    except HTTPException:
        raise
    except Exception as exc:
        raise http_error(500, "Image generation failed. Please try again.") from exc


@router.post("/prompt")
async def enhance_prompt_veo(request: PromptEnhanceRequest):
    """Enhance a rough idea into a cinematic prompt via veoaifree (VEO Gemini or Grok AI tab)."""
    eng = (request.engine or "veo").lower()
    if eng in ("veo", "veo-prompt", "veo3", "grok", "grok-prompt", "grok-ai"):
        limits = extract_limits_from_body(request)
        check_quota("veo", limits)
        result = await veo_service.generate_prompt(
            idea=request.idea,
            user_agent=request.veo_user_agent,
            provider="grok" if eng.startswith("grok") else "veo",
            grok_model=request.grok_model or "grok-ai-4.0",
        )
        record_use("veo")
        return {"success": True, **result}
    raise http_error(400, "That prompt engine is not supported.")


@router.post("/tts")
async def generate_tts(
    request: TTSRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Text-to-speech — neural voices."""
    try:
        result = await tts_service.generate_speech(
            text=request.text,
            voice=request.voice or "hi-IN-MadhurNeural",
            lang=request.lang or "hi-IN",
            speed=request.speed or 1.0,
            pitch=request.pitch or 0,
            emotion=request.emotion or "default",
            user_agent=request.veo_user_agent,
        )
        return _public_media_response(db, current_user, result, kind="audio", engine="tts")
    except HTTPException:
        raise
    except Exception as exc:
        raise http_error(500, "Speech generation failed. Please try again.") from exc


@router.post("/batch-images")
async def batch_generate_images():
    return {"message": "Batch image generation endpoint"}


@router.post("/video")
async def generate_video(
    request: VideoGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate video clip."""
    try:
        limits = extract_limits_from_body(request)
        engine = (request.engine or "veo3").lower()
        prompt = _video_prompt(request)

        if engine in ("veo3", "veo", "veo-video", "google-veo", "seedance", "seedance2", "grok", "grok-video", "xai-grok"):
            check_quota("veo", limits)
            poll = request.veo_poll_seconds or int(os.getenv("VEO_POLL_SECONDS", "85"))
            veo_model = (request.veo_model or "3.1").strip()
            if engine.startswith("grok") or engine == "xai-grok":
                veo_model = veo_model if "grok" in veo_model.lower() else "grok-4"
            elif engine.startswith("seedance") and "seedance" not in veo_model.lower():
                veo_model = "seedance-2.0"
            image_data = (request.image or request.image_url or "").strip() or None
            if image_data and "seedance" in veo_model.lower():
                image_data = None
            i2v_poll = min(poll, 60) if image_data else poll
            result = await veo_service.generate_video(
                prompt=prompt,
                aspect_ratio=request.aspect_ratio or "9:16",
                user_agent=request.veo_user_agent,
                poll_seconds=i2v_poll,
                veo_model=veo_model,
                image_data=image_data,
            )
            record_use("veo")
            return _public_media_response(
                db,
                current_user,
                result,
                kind="video",
                engine=result.get("engine", "veo3"),
            )

        if engine in ("ltx-video", "ltx", "LTX-Video", "cog", "cogvideo"):
            kaggle_url = _kaggle_base_url(override=request.kaggle_tunnel_url)
            payload = {
                "prompt": prompt,
                "image_url": request.image_url or request.image,
                "engine": "ltx-video" if "ltx" in engine else engine,
                "duration_seconds": request.duration_seconds,
                "aspect_ratio": request.aspect_ratio,
            }
            try:
                resp = requests.post(f"{kaggle_url}/generate/video", json=payload, timeout=600)
            except requests.RequestException as exc:
                raise http_error(502, "Remote video service is unavailable.") from exc

            if resp.status_code >= 400:
                raise http_error(502, "Remote video service returned an error.")

            data = resp.json()
            return _public_media_response(
                db,
                current_user,
                {
                    "video_url": data.get("video_url") or data.get("clip_url"),
                    "video_path": data.get("video_path"),
                    "metadata": data.get("metadata", {"timestamp": datetime.now().isoformat()}),
                    "job_id": data.get("job_id"),
                },
                kind="video",
                engine=engine,
            )

        raise http_error(400, "That video engine is not supported.")

    except HTTPException:
        raise
    except Exception as exc:
        raise http_error(500, "Video generation failed. Please try again.") from exc


@router.post("/batch-videos")
async def batch_generate_videos():
    return {"message": "Batch video generation endpoint"}


@router.post("/upscale")
async def upscale_image():
    return {"message": "Image upscaling endpoint"}


@router.post("/inpaint")
async def inpaint_image():
    return {"message": "Image inpainting endpoint"}


@router.post("/remove-bg")
async def remove_background():
    return {"message": "Background removal endpoint"}
