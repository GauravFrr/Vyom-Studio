"""Per-user media files — private storage + DB registry."""
from __future__ import annotations

import mimetypes
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from models.database import GeneratedAsset, Project
from services.auth_service import JWT_ALGORITHM, JWT_SECRET
from storage_paths import STORAGE_ROOT

_MEDIA_EXTS = {
    "image": {".png", ".jpg", ".jpeg", ".webp", ".gif"},
    "video": {".mp4", ".webm", ".mov"},
    "audio": {".mp3", ".wav", ".m4a", ".ogg"},
}
_SIG_HOURS = 6


def _kind_for_ext(ext: str) -> Optional[str]:
    ext = ext.lower()
    for kind, exts in _MEDIA_EXTS.items():
        if ext in exts:
            return kind
    return None


def user_media_dir(user_id: str, engine: str) -> Path:
    path = STORAGE_ROOT / "users" / user_id / engine
    path.mkdir(parents=True, exist_ok=True)
    return path


def asset_api_path(asset_id: str) -> str:
    return f"/api/storage/assets/{asset_id}/file"


def create_media_signature(asset_id: str, user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=_SIG_HOURS)
    return jwt.encode(
        {"aid": asset_id, "uid": user_id, "exp": exp, "typ": "media"},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def verify_media_signature(asset_id: str, signature: str) -> Optional[str]:
    try:
        payload = jwt.decode(signature, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("typ") != "media" or payload.get("aid") != asset_id:
            return None
        return payload.get("uid")
    except JWTError:
        return None


def save_bytes(
    db: Session,
    user_id: str,
    content: bytes,
    *,
    kind: str,
    engine: str,
    ext: str,
    filename: Optional[str] = None,
) -> Dict[str, Any]:
    asset_id = uuid.uuid4().hex[:12]
    ext = ext if ext.startswith(".") else f".{ext}"
    fname = filename or f"{asset_id}{ext}"
    out_dir = user_media_dir(user_id, engine)
    disk_path = out_dir / fname
    disk_path.write_bytes(content)
    rel = disk_path.relative_to(STORAGE_ROOT).as_posix()

    asset = GeneratedAsset(
        id=asset_id,
        user_id=user_id,
        kind=kind,
        engine=engine,
        filename=fname,
        disk_path=rel,
        size_bytes=len(content),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    sig = create_media_signature(asset_id, user_id)
    url = f"{asset_api_path(asset_id)}?sig={sig}"
    return {
        "asset_id": asset_id,
        "media_url": url,
        "image_url": url if kind == "image" else None,
        "video_url": url if kind == "video" else None,
        "audio_url": url if kind == "audio" else None,
        "file_path": str(disk_path),
        "url": url,
    }


def adopt_local_file(
    db: Session,
    user_id: str,
    source: Path,
    *,
    kind: str,
    engine: str,
) -> Dict[str, Any]:
    """Register an existing file under the user's private folder."""
    if not source.is_file():
        raise FileNotFoundError(str(source))
    ext = source.suffix.lower() or ".bin"
    content = source.read_bytes()
    return save_bytes(db, user_id, content, kind=kind, engine=engine, ext=ext)


def adopt_generation_result(
    db: Session,
    user_id: str,
    result: Dict[str, Any],
    *,
    kind: str,
    engine: str,
) -> Dict[str, Any]:
    """Wrap a generator result — store file privately and swap URLs."""
    out = dict(result)
    path_str = out.get("image_path") or out.get("video_path") or out.get("audio_path") or out.get("file_path")
    url_key = "image_url" if kind == "image" else "video_url" if kind == "video" else "audio_url"

    if path_str:
        try:
            local = Path(path_str)
            if not local.is_file():
                rel = str(path_str).replace("\\", "/")
                if "/storage/" in rel:
                    rel = rel.split("/storage/", 1)[-1]
                    local = STORAGE_ROOT / rel.replace("/", "\\") if "\\" in str(STORAGE_ROOT) else STORAGE_ROOT / rel
            if local.is_file():
                reg = adopt_local_file(db, user_id, local, kind=kind, engine=engine)
                out[url_key] = reg["media_url"]
                out["media_url"] = reg["media_url"]
                out[f"{kind}_path"] = reg["file_path"]
                out["asset_id"] = reg["asset_id"]
                if kind == "image":
                    out["image_url"] = reg["media_url"]
                elif kind == "video":
                    out["video_url"] = reg["media_url"]
                elif kind == "audio":
                    out["audio_url"] = reg["media_url"]
        except OSError:
            pass
    return out


def list_user_assets(db: Session, user_id: str) -> List[GeneratedAsset]:
    return (
        db.query(GeneratedAsset)
        .filter(GeneratedAsset.user_id == user_id)
        .order_by(GeneratedAsset.created_at.desc())
        .all()
    )


def get_user_asset(db: Session, user_id: str, asset_id: str) -> Optional[GeneratedAsset]:
    return (
        db.query(GeneratedAsset)
        .filter(GeneratedAsset.id == asset_id, GeneratedAsset.user_id == user_id)
        .first()
    )


def asset_to_item(asset: GeneratedAsset, user_id: str, links: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    sig = create_media_signature(asset.id, user_id)
    url = f"{asset_api_path(asset.id)}?sig={sig}"
    link = links.get(url.split("?")[0]) or links.get(asset_api_path(asset.id))
    return {
        "id": asset.id,
        "filename": asset.filename,
        "subdir": asset.engine,
        "kind": asset.kind,
        "engine": asset.engine,
        "engine_label": asset.engine.replace("-", " ").title(),
        "url": url,
        "size_bytes": asset.size_bytes or 0,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
        "modified_at": asset.created_at.isoformat() if asset.created_at else None,
        "linked_project_id": link.get("project_id") if link else None,
        "linked_project_name": link.get("project_name") if link else None,
        "linked_scene_number": link.get("scene_number") if link else None,
        "orphan": link is None,
    }


def build_project_links(db: Session, user_id: str) -> Dict[str, Dict[str, Any]]:
    links: Dict[str, Dict[str, Any]] = {}
    rows = db.query(Project).filter(Project.user_id == user_id).all()
    for project in rows:
        settings = project.settings or {}
        for scene in settings.get("scenes") or []:
            scene_number = scene.get("scene_number")
            for key in ("image_url", "video_url", "audio_url"):
                raw = scene.get(key)
                if not raw:
                    continue
                base = str(raw).split("?")[0]
                links[base] = {
                    "project_id": project.id,
                    "project_name": project.name,
                    "scene_number": scene_number,
                }
    return links


def user_owns_legacy_ref(db: Session, user_id: str, ref: str) -> bool:
    """True if ref appears in this user's project scenes or assets."""
    normalized = ref.split("?")[0]
    links = build_project_links(db, user_id)
    if normalized in links:
        return True
    for base in links:
        if normalized.endswith(base.split("/")[-1]):
            return True
    for a in db.query(GeneratedAsset).filter(GeneratedAsset.user_id == user_id).all():
        if normalized == asset_api_path(a.id) or f"/storage/{a.disk_path}" in normalized:
            return True
    return False


def resolve_legacy_path(ref: str) -> Optional[Path]:
    raw = ref.strip().replace("\\", "/")
    if raw.startswith("/storage/"):
        rel = raw.removeprefix("/storage/")
    elif raw.startswith("storage/"):
        rel = raw.removeprefix("storage/")
    else:
        return None
    path = (STORAGE_ROOT / rel).resolve()
    try:
        path.relative_to(STORAGE_ROOT.resolve())
    except ValueError:
        return None
    return path if path.is_file() else None


def guess_kind(path: Path) -> str:
    k = _kind_for_ext(path.suffix)
    return k or "image"


def media_content_type(path: Path) -> str:
    ctype, _ = mimetypes.guess_type(str(path))
    return ctype or "application/octet-stream"
