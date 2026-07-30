"""Private media — list, stream, delete (per user only)."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from core.errors import http_error
from dependencies.auth import get_current_user
from models.database import GeneratedAsset, User
from models.db import get_db
from services import user_media as um
from services.auth_service import decode_access_token
from storage_paths import STORAGE_ROOT

router = APIRouter()
_bearer = HTTPBearer(auto_error=False)


def _user_from_credentials(credentials: HTTPAuthorizationCredentials | None, db: Session) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise http_error(401, "Please sign in to continue.")
    payload = decode_access_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        raise http_error(401, "Your session expired. Please sign in again.")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise http_error(401, "Account not found or disabled.")
    return user


def _resolve_media_user(
    asset_id: str,
    sig: str | None,
    credentials: HTTPAuthorizationCredentials | None,
    db: Session,
) -> GeneratedAsset:
    if sig:
        sig_user = um.verify_media_signature(asset_id, sig)
        if not sig_user:
            raise http_error(403, "This link has expired or is not valid.")
        asset = db.query(GeneratedAsset).filter(
            GeneratedAsset.id == asset_id,
            GeneratedAsset.user_id == sig_user,
        ).first()
        if not asset:
            raise http_error(404, "File not found.")
        return asset

    user = _user_from_credentials(credentials, db)
    asset = um.get_user_asset(db, user.id, asset_id)
    if not asset:
        raise http_error(404, "File not found.")
    return asset


@router.get("/generated")
async def list_generated_media(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    links = um.build_project_links(db, current_user.id)
    assets = um.list_user_assets(db, current_user.id)
    items = [um.asset_to_item(a, current_user.id, links) for a in assets]
    stats = {"images": 0, "videos": 0, "audio": 0, "total_bytes": 0, "orphans": 0}
    for it in items:
        if it["kind"] == "image":
            stats["images"] += 1
        elif it["kind"] == "video":
            stats["videos"] += 1
        elif it["kind"] == "audio":
            stats["audio"] += 1
        stats["total_bytes"] += it.get("size_bytes") or 0
        if it.get("orphan"):
            stats["orphans"] += 1
    return {"success": True, "items": items, "stats": stats}


@router.get("/assets/{asset_id}/file")
async def stream_asset(
    asset_id: str,
    sig: str | None = Query(None),
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    asset = _resolve_media_user(asset_id, sig, credentials, db)

    disk = (STORAGE_ROOT / asset.disk_path).resolve()
    try:
        disk.relative_to(STORAGE_ROOT.resolve())
    except ValueError as exc:
        raise http_error(404, "File not found.") from exc
    if not disk.is_file():
        raise http_error(404, "File not found.")

    return FileResponse(disk, media_type=um.media_content_type(disk), filename=asset.filename)


@router.get("/file")
async def stream_legacy_ref(
    ref: str = Query(..., min_length=5, max_length=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not um.user_owns_legacy_ref(db, current_user.id, ref):
        raise http_error(404, "File not found.")
    disk = um.resolve_legacy_path(ref)
    if not disk:
        raise http_error(404, "File not found.")
    return FileResponse(disk, media_type=um.media_content_type(disk), filename=disk.name)


@router.delete("/assets/{asset_id}")
async def delete_asset(
    asset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = um.get_user_asset(db, current_user.id, asset_id)
    if not asset:
        raise http_error(404, "File not found.")
    disk = STORAGE_ROOT / asset.disk_path
    if disk.is_file():
        try:
            disk.unlink()
        except OSError as exc:
            raise http_error(500, "Could not delete this file.") from exc
    db.delete(asset)
    db.commit()
    return {"success": True, "deleted": asset_id}
