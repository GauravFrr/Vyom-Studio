"""Export engine — FFmpeg assemble, ZIP bundles."""
from __future__ import annotations

import json
import shutil
import tempfile
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from core.errors import http_error
from dependencies.auth import get_current_user, get_verified_user
from models.database import User
from models.db import get_db
from services import user_media as um
from services.export_service import EXPORT_DIR, assemble_video, resolve_storage_path

router = APIRouter(dependencies=[Depends(get_verified_user)])


class AssembleScene(BaseModel):
    scene_number: Optional[int] = None
    video_url: Optional[str] = None
    video_path: Optional[str] = None
    image_url: Optional[str] = None
    image_path: Optional[str] = None
    duration_sec: Optional[float] = None
    estimated_duration_seconds: Optional[float] = None
    brief_description: Optional[str] = None


class AssembleRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    scenes: List[AssembleScene] = Field(..., min_length=1)
    project_id: Optional[str] = None
    aspect_ratio: str = "9:16"
    transition: str = "fade"
    transition_duration: float = 0.5
    voiceover_url: Optional[str] = None
    include_voiceover: bool = True
    include_subtitles: bool = False


def _assert_scene_refs(db: Session, user_id: str, scenes: List[Dict[str, Any]]) -> None:
    for scene in scenes:
        for key in ("video_url", "video_path", "image_url", "image_path"):
            ref = scene.get(key)
            if ref and not um.user_owns_legacy_ref(db, user_id, str(ref)):
                raise http_error(404, "One of the scene files could not be found.")


def _finish_export(db: Session, user: User, result: Dict[str, Any]) -> Dict[str, Any]:
    adopted = um.adopt_generation_result(db, user.id, result, kind="video", engine="export")
    adopted.pop("video_path", None)
    adopted.pop("file_path", None)
    return adopted


@router.post("/assemble")
async def assemble_video_endpoint(
    payload: str = Form(...),
    music: Optional[UploadFile] = File(None),
    voiceover: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = json.loads(payload)
        request = AssembleRequest(**data)
    except (json.JSONDecodeError, ValueError) as exc:
        raise http_error(400, "Invalid export settings.") from exc

    scenes = [s.model_dump(exclude_none=True) for s in request.scenes]
    _assert_scene_refs(db, current_user.id, scenes)

    with tempfile.TemporaryDirectory(prefix="vyom-upload-") as tmp:
        tmp_path = Path(tmp)
        music_path: Optional[Path] = None
        voice_path: Optional[Path] = None

        if music and music.filename:
            ext = Path(music.filename).suffix or ".mp3"
            music_path = tmp_path / f"music{ext}"
            music_path.write_bytes(await music.read())

        if voiceover and voiceover.filename:
            ext = Path(voiceover.filename).suffix or ".mp3"
            voice_path = tmp_path / f"voiceover{ext}"
            voice_path.write_bytes(await voiceover.read())
        elif request.voiceover_url and request.include_voiceover:
            if not um.user_owns_legacy_ref(db, current_user.id, request.voiceover_url):
                voice_path = None
            else:
                try:
                    voice_path = resolve_storage_path(request.voiceover_url)
                except HTTPException:
                    voice_path = None

        persisted_music: Optional[Path] = None
        if music_path and music_path.is_file():
            persisted_music = EXPORT_DIR / f"music_{uuid.uuid4().hex[:8]}{music_path.suffix}"
            shutil.copy2(music_path, persisted_music)

        if voice_path and voice_path.is_file() and voiceover and voiceover.filename:
            persisted_voice = EXPORT_DIR / f"voice_{uuid.uuid4().hex[:8]}{voice_path.suffix}"
            shutil.copy2(voice_path, persisted_voice)
            voice_path = persisted_voice
        elif request.voiceover_url and request.include_voiceover and not voiceover:
            if um.user_owns_legacy_ref(db, current_user.id, request.voiceover_url):
                voice_path = resolve_storage_path(request.voiceover_url)

        try:
            result = assemble_video(
                scenes,
                aspect_ratio=request.aspect_ratio,
                transition=request.transition,
                transition_duration=request.transition_duration,
                voiceover_path=voice_path if request.include_voiceover else None,
                music_path=persisted_music,
                include_voiceover=request.include_voiceover,
                project_id=request.project_id,
            )
        finally:
            if persisted_music:
                persisted_music.unlink(missing_ok=True)

        return _finish_export(db, current_user, result)


@router.post("/assemble-json")
async def assemble_video_json(
    request: AssembleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scenes = [s.model_dump(exclude_none=True) for s in request.scenes]
    _assert_scene_refs(db, current_user.id, scenes)
    voice_path = None
    if request.voiceover_url and request.include_voiceover:
        if um.user_owns_legacy_ref(db, current_user.id, request.voiceover_url):
            voice_path = resolve_storage_path(request.voiceover_url)
    result = assemble_video(
        scenes,
        aspect_ratio=request.aspect_ratio,
        transition=request.transition,
        transition_duration=request.transition_duration,
        voiceover_path=voice_path,
        include_voiceover=request.include_voiceover,
        project_id=request.project_id,
    )
    return _finish_export(db, current_user, result)


@router.post("/zip-images")
async def zip_images(
    body: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scenes = body.get("scenes") or []
    paths: List[Path] = []
    for scene in scenes:
        ref = scene.get("image_url") or scene.get("image_path")
        if ref:
            if not um.user_owns_legacy_ref(db, current_user.id, str(ref)):
                raise http_error(404, "One of the scene images could not be found.")
            paths.append(resolve_storage_path(str(ref)))

    if not paths:
        raise http_error(400, "No scene images to export.")

    zip_name = f"images_{uuid.uuid4().hex[:10]}.zip"
    zip_path = EXPORT_DIR / zip_name
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, p in enumerate(paths, start=1):
            zf.write(p, arcname=f"scene_{i:02d}{p.suffix or '.png'}")

    finished = _finish_export(
        db,
        current_user,
        {
            "video_url": f"/storage/generated/export/{zip_name}",
            "video_path": str(zip_path),
            "success": True,
            "count": len(paths),
        },
    )
    finished["zip_url"] = finished.get("video_url")
    return finished


@router.post("/zip-clips")
async def zip_clips(
    body: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scenes = body.get("scenes") or []
    paths: List[Path] = []
    for scene in scenes:
        ref = scene.get("video_url") or scene.get("video_path")
        if ref:
            if not um.user_owns_legacy_ref(db, current_user.id, str(ref)):
                raise http_error(404, "One of the scene clips could not be found.")
            paths.append(resolve_storage_path(str(ref)))

    if not paths:
        raise http_error(400, "No scene video clips to export.")

    zip_name = f"clips_{uuid.uuid4().hex[:10]}.zip"
    zip_path = EXPORT_DIR / zip_name
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, p in enumerate(paths, start=1):
            zf.write(p, arcname=f"scene_{i:02d}{p.suffix or '.mp4'}")

    finished = _finish_export(
        db,
        current_user,
        {
            "video_url": f"/storage/generated/export/{zip_name}",
            "video_path": str(zip_path),
            "success": True,
            "count": len(paths),
        },
    )
    finished["zip_url"] = finished.get("video_url")
    return finished


@router.post("/subtitles")
async def generate_subtitles():
    raise http_error(501, "Subtitle export is not available yet.")
