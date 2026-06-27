"""Folder password protection: set, remove, and unlock."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from .. import db, r2
from ..schemas import FolderLockRequest, FolderUnlockRequest, TokenResponse
from ..security import (
    CurrentUser,
    create_folder_token,
    hash_password,
    unlocked_folders,
    verify_password,
)
from ..user_scope import strip_user_root, to_storage_prefix

router = APIRouter(prefix="/api/folders", tags=["folders"])


@router.get("/locked")
async def locked(user: CurrentUser) -> dict:
    folders = db.list_locked_folders(user.user_id)
    return {"folders": [strip_user_root(user.user_id, f) for f in folders]}


@router.post("/lock")
async def lock(user: CurrentUser, body: FolderLockRequest) -> dict:
    folder = to_storage_prefix(user.user_id, body.folder)
    if folder == to_storage_prefix(user.user_id, ""):
        raise HTTPException(status_code=400, detail="Choose a folder to protect.")
    db.set_folder_lock(user.user_id, folder, hash_password(body.password))
    return {"folder": strip_user_root(user.user_id, folder), "locked": True}


@router.post("/unlock", response_model=TokenResponse)
async def unlock(user: CurrentUser, body: FolderUnlockRequest) -> TokenResponse:
    folder = to_storage_prefix(user.user_id, body.folder)
    stored = db.get_folder_lock(user.user_id, folder)
    if stored is None:
        raise HTTPException(status_code=404, detail="Folder is not protected.")
    if not verify_password(body.password, stored):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect folder password."
        )
    folders = unlocked_folders(body.current_token, user.user_id) | {folder}
    token, expires = create_folder_token(user.user_id, sorted(folders))
    return TokenResponse(token=token, expires_at=expires)


@router.post("/remove")
async def remove(user: CurrentUser, body: FolderUnlockRequest) -> dict:
    """Remove protection from a folder (requires the current folder password)."""
    folder = to_storage_prefix(user.user_id, body.folder)
    stored = db.get_folder_lock(user.user_id, folder)
    if stored is None:
        raise HTTPException(status_code=404, detail="Folder is not protected.")
    if not verify_password(body.password, stored):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect folder password."
        )
    db.remove_folder_lock(user.user_id, folder)
    return {"folder": strip_user_root(user.user_id, folder), "locked": False}
