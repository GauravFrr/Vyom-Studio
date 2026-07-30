"""Project CRUD — persists story, scenes, and metadata to SQLite."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from dependencies.auth import get_current_user
from models.database import Project, User
from models.db import get_db

router = APIRouter(dependencies=[Depends(get_current_user)])


class ScenePayload(BaseModel):
    id: Optional[str] = None
    scene_number: Optional[int] = None
    brief_description: Optional[str] = None
    detailed_action: Optional[str] = None
    action: Optional[str] = None
    mood: Optional[str] = None
    atmosphere: Optional[str] = None
    suggested_camera_angle: Optional[str] = None
    estimated_duration_seconds: Optional[int] = None
    duration_sec: Optional[int] = None
    key_visual_elements: Optional[Any] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    image_path: Optional[str] = None
    video_path: Optional[str] = None
    prompt: Optional[str] = None
    image_prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    motion_prompt: Optional[str] = None
    status: Optional[str] = "pending"


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    genre: Optional[str] = "mythological"
    idea: Optional[str] = ""
    expanded_story: Optional[str] = ""
    bible: Optional[str] = ""
    language: Optional[str] = "english"
    length: Optional[str] = "short"
    scenes: Optional[List[ScenePayload]] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    genre: Optional[str] = None
    idea: Optional[str] = None
    expanded_story: Optional[str] = None
    bible: Optional[str] = None
    language: Optional[str] = None
    length: Optional[str] = None
    status: Optional[str] = None
    scenes: Optional[List[ScenePayload]] = None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_scene(raw: ScenePayload | Dict[str, Any], index: int) -> Dict[str, Any]:
    data = raw.model_dump(exclude_none=True) if isinstance(raw, ScenePayload) else dict(raw)
    if not data.get("id"):
        data["id"] = str(uuid.uuid4())[:12]
    if data.get("scene_number") is None:
        data["scene_number"] = index + 1
    if not data.get("status"):
        data["status"] = "pending"
    mood = data.get("mood") or data.get("atmosphere")
    if mood:
        data["mood"] = mood
    action = data.get("brief_description") or data.get("detailed_action") or data.get("action")
    if action and not data.get("brief_description"):
        data["brief_description"] = action
    dur = data.get("duration_sec") or data.get("estimated_duration_seconds")
    if dur is not None:
        data["duration_sec"] = dur
        data["estimated_duration_seconds"] = dur
    img = data.get("image_url") or data.get("image_path")
    if img:
        data["image_url"] = img
    vid = data.get("video_url") or data.get("video_path")
    if vid:
        data["video_url"] = vid
    return data


def _normalize_scenes(scenes: Optional[List[ScenePayload]]) -> List[Dict[str, Any]]:
    if not scenes:
        return []
    return [_normalize_scene(s, i) for i, s in enumerate(scenes)]


def _derive_status(scenes: List[Dict[str, Any]]) -> str:
    if not scenes:
        return "draft"
    if all(s.get("status") == "approved" for s in scenes):
        return "complete"
    if any(s.get("image_url") or s.get("video_url") for s in scenes):
        return "in_progress"
    return "draft"


def _thumbnail_from_scenes(scenes: List[Dict[str, Any]]) -> Optional[str]:
    for scene in scenes:
        thumb = scene.get("image_url") or scene.get("image_path")
        if thumb:
            return thumb
    return None


def _build_settings(
    *,
    idea: str = "",
    expanded_story: str = "",
    language: str = "english",
    length: str = "short",
    scenes: Optional[List[ScenePayload]] = None,
    existing: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    base = dict(existing or {})
    base["idea"] = idea
    base["expanded_story"] = expanded_story
    base["language"] = language
    base["length"] = length
    if scenes is not None:
        base["scenes"] = _normalize_scenes(scenes)
    elif "scenes" not in base:
        base["scenes"] = []
    return base


def _scene_pipeline_stats(scenes: List[Dict[str, Any]]) -> Dict[str, int]:
    total = len(scenes)
    prompts = images = videos = approved = 0
    for scene in scenes:
        if (scene.get("image_prompt") or "").strip() and (scene.get("motion_prompt") or "").strip():
            prompts += 1
        elif (scene.get("prompt") or "").strip():
            prompts += 1
        if scene.get("image_url") or scene.get("image_path"):
            images += 1
        if scene.get("video_url") or scene.get("video_path"):
            videos += 1
        if scene.get("status") == "approved":
            approved += 1
    return {
        "scene_count": total,
        "scenes_with_prompts": prompts,
        "scenes_with_image": images,
        "scenes_with_video": videos,
        "scenes_approved": approved,
    }


def _project_summary(project: Project) -> Dict[str, Any]:
    settings = project.settings or {}
    scenes = settings.get("scenes") or []
    pipeline = _scene_pipeline_stats(scenes)
    return {
        "id": project.id,
        "name": project.name,
        "genre": project.genre,
        "status": project.status,
        "thumbnail": project.thumbnail,
        "scene_count": pipeline["scene_count"],
        "scenes_with_prompts": pipeline["scenes_with_prompts"],
        "scenes_with_image": pipeline["scenes_with_image"],
        "scenes_with_video": pipeline["scenes_with_video"],
        "scenes_approved": pipeline["scenes_approved"],
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


def _project_detail(project: Project) -> Dict[str, Any]:
    settings = project.settings or {}
    scenes = settings.get("scenes") or []
    return {
        **_project_summary(project),
        "idea": settings.get("idea") or "",
        "expanded_story": settings.get("expanded_story") or "",
        "language": settings.get("language") or "english",
        "length": settings.get("length") or "short",
        "bible": project.bible or "",
        "scenes": scenes,
    }


def _get_project_for_user(db: Session, project_id: str, user: User) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")
    return project


# ----- assets (stubs — must stay before /{project_id}) -----
@router.get("/assets")
async def list_assets():
    return {"success": True, "assets": []}


@router.post("/assets")
async def create_asset():
    return {"success": True, "message": "Asset upload not implemented yet"}


# ----- templates (stubs) -----
@router.get("/templates")
async def list_templates():
    return {"success": True, "templates": []}


@router.post("/templates")
async def create_template():
    return {"success": True, "message": "Template save not implemented yet"}


# ----- projects collection -----
@router.get("/")
async def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(Project)
        .filter(Project.user_id == current_user.id)
        .order_by(Project.updated_at.desc(), Project.created_at.desc())
        .all()
    )
    return {"success": True, "projects": [_project_summary(p) for p in rows]}


@router.post("/")
async def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scenes = _normalize_scenes(body.scenes)
    settings = _build_settings(
        idea=body.idea or "",
        expanded_story=body.expanded_story or "",
        language=body.language or "english",
        length=body.length or "short",
        scenes=body.scenes,
    )
    now = _utc_now()
    project = Project(
        id=str(uuid.uuid4())[:12],
        user_id=current_user.id,
        name=body.name.strip(),
        genre=body.genre or "mythological",
        status=_derive_status(scenes),
        thumbnail=_thumbnail_from_scenes(scenes),
        bible=body.bible or "",
        settings=settings,
        created_at=now,
        updated_at=now,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return {"success": True, "project": _project_detail(project)}


# ----- catch-all: must stay last -----
@router.get("/{project_id}")
async def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_project_for_user(db, project_id, current_user)
    return {"success": True, "project": _project_detail(project)}


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_project_for_user(db, project_id, current_user)
    settings = dict(project.settings or {})

    if body.name is not None:
        project.name = body.name.strip()
    if body.genre is not None:
        project.genre = body.genre
    if body.bible is not None:
        project.bible = body.bible
    if any(v is not None for v in (body.idea, body.expanded_story, body.language, body.length, body.scenes)):
        settings = _build_settings(
            idea=body.idea if body.idea is not None else settings.get("idea", ""),
            expanded_story=body.expanded_story if body.expanded_story is not None else settings.get("expanded_story", ""),
            language=body.language if body.language is not None else settings.get("language", "english"),
            length=body.length if body.length is not None else settings.get("length", "short"),
            scenes=body.scenes if body.scenes is not None else None,
            existing=settings,
        )
        project.settings = settings

    scenes = settings.get("scenes") or []
    project.thumbnail = _thumbnail_from_scenes(scenes)
    if body.status is not None:
        project.status = body.status
    else:
        project.status = _derive_status(scenes)
    project.updated_at = _utc_now()

    db.commit()
    db.refresh(project)
    return {"success": True, "project": _project_detail(project)}


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_project_for_user(db, project_id, current_user)
    db.delete(project)
    db.commit()
    return {"success": True, "deleted": project_id}
