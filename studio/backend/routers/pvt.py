"""
Insta Pvt Content — Durex AI image transform endpoints.
"""
from __future__ import annotations

import base64
import re
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from dependencies.auth import get_verified_user
from services.durex_service import durex_service
from services.face_swap_service import face_swap_service
from services.usage_limiter import check_quota, extract_limits_from_body, record_use
from routers.usage_limits_mixin import UsageLimitsMixin

router = APIRouter(dependencies=[Depends(get_verified_user)])


class DurexTransformJsonRequest(UsageLimitsMixin, BaseModel):
    """Base64 image upload (for frontend data-URL workflow)."""
    prompt: str
    image_base64: str
    filename: Optional[str] = "upload.jpg"
    durex_api_key: Optional[str] = None
    durex_api_url: Optional[str] = None
    durex_proxy: Optional[str] = None


class DurexTransformVideoJsonRequest(UsageLimitsMixin, BaseModel):
    """Base64 video + prompt — same Durex flow as image transform."""
    prompt: str
    video_base64: str
    filename: Optional[str] = "upload.mp4"
    durex_api_key: Optional[str] = None
    durex_api_url: Optional[str] = None
    durex_proxy: Optional[str] = None


class FaceCopyImageRequest(UsageLimitsMixin, BaseModel):
    """Scene reference + model face → image with model face on scene body."""
    scene_base64: str
    face_base64: str
    scene_filename: Optional[str] = "scene.jpg"
    face_filename: Optional[str] = "face.jpg"
    notes: Optional[str] = None
    kaggle_tunnel_url: Optional[str] = None
    durex_api_key: Optional[str] = None
    durex_api_url: Optional[str] = None
    durex_proxy: Optional[str] = None


class FaceSwapVideoRequest(UsageLimitsMixin, BaseModel):
    """Reference video + model face → video with swapped face."""
    video_base64: str
    face_base64: str
    video_filename: Optional[str] = "reference.mp4"
    face_filename: Optional[str] = "face.jpg"
    notes: Optional[str] = None
    kaggle_tunnel_url: Optional[str] = None


def _decode_data_url(data: str) -> tuple[bytes, str]:
    raw = data.strip()
    if raw.startswith("data:"):
        match = re.match(r"data:([^;]+);base64,(.+)", raw, re.DOTALL)
        if not match:
            raise HTTPException(status_code=400, detail="Invalid data URL.")
        mime, b64 = match.group(1), match.group(2)
        if "png" in mime:
            ext = "png"
        elif "webm" in mime:
            ext = "webm"
        elif "mp4" in mime or "video" in mime:
            ext = "mp4"
        else:
            ext = "jpg"
        return base64.b64decode(b64), f"upload.{ext}"
    try:
        return base64.b64decode(raw), "upload.jpg"
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}") from e


@router.post("/transform")
async def transform_image_multipart(
    prompt: str = Form(...),
    image: UploadFile = File(...),
    durex_api_key: Optional[str] = Form(None),
    durex_api_url: Optional[str] = Form(None),
    durex_proxy: Optional[str] = Form(None),
):
    """Multipart upload — image file + prompt."""
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required.")
    content = await image.read()
    if not content:
        raise HTTPException(status_code=400, detail="Image file is empty.")
    result = await durex_service.transform_image(
        image_bytes=content,
        prompt=prompt,
        filename=image.filename or "upload.jpg",
        api_key=durex_api_key,
        base_url=durex_api_url,
        proxy=durex_proxy,
    )
    return result


@router.post("/transform-json")
async def transform_image_json(request: DurexTransformJsonRequest):
    """JSON body with base64 / data-URL image (used by the React page)."""
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required.")
    content, filename = _decode_data_url(request.image_base64)
    limits = extract_limits_from_body(request)
    check_quota("durex", limits)
    result = await durex_service.transform_image(
        image_bytes=content,
        prompt=request.prompt,
        filename=request.filename or filename,
        api_key=request.durex_api_key,
        base_url=request.durex_api_url,
        proxy=request.durex_proxy,
    )
    record_use("durex")
    return result


@router.post("/transform-video-json")
async def transform_video_json(request: DurexTransformVideoJsonRequest):
    """JSON body with base64 / data-URL video + transform prompt."""
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required.")
    content, filename = _decode_data_url(request.video_base64)
    limits = extract_limits_from_body(request)
    check_quota("durex", limits)
    result = await durex_service.transform_video(
        video_bytes=content,
        prompt=request.prompt,
        filename=request.filename or filename,
        api_key=request.durex_api_key,
        base_url=request.durex_api_url,
        proxy=request.durex_proxy,
    )
    record_use("durex")
    return result


@router.post("/face-copy-image")
async def face_copy_image(request: FaceCopyImageRequest):
    """Two images: scene (pose/outfit/bg) + model face → blended influencer shot."""
    scene_bytes, scene_name = _decode_data_url(request.scene_base64)
    face_bytes, face_name = _decode_data_url(request.face_base64)
    limits = extract_limits_from_body(request)
    check_quota("durex", limits)
    result = await face_swap_service.copy_face_image(
        scene_bytes=scene_bytes,
        face_bytes=face_bytes,
        scene_filename=request.scene_filename or scene_name,
        face_filename=request.face_filename or face_name,
        notes=request.notes,
        kaggle_tunnel_url=request.kaggle_tunnel_url,
        durex_api_key=request.durex_api_key,
        durex_api_url=request.durex_api_url,
        durex_proxy=request.durex_proxy,
    )
    record_use("durex")
    return result


@router.post("/face-swap-video")
async def face_swap_video(request: FaceSwapVideoRequest):
    """Reference video + model face → face-swapped clip (Kaggle GPU)."""
    video_bytes, _ = _decode_data_url(request.video_base64)
    face_bytes, face_name = _decode_data_url(request.face_base64)
    limits = extract_limits_from_body(request)
    check_quota("durex", limits)
    result = await face_swap_service.swap_face_video(
        video_bytes=video_bytes,
        face_bytes=face_bytes,
        notes=request.notes,
        kaggle_tunnel_url=request.kaggle_tunnel_url,
    )
    record_use("durex")
    return result
