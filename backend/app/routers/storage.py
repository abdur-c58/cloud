"""Storage browsing + mutation endpoints (all require a valid session)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from .. import db, r2
from ..locks import ensure_unlocked, folder_token_header
from ..media import classify, content_type_for, ext_of, is_media
from ..schemas import (
    CreateFolderRequest,
    DeleteRequest,
    FavoriteRequest,
    MoveRequest,
    PresignUploadRequest,
    PresignUploadResponse,
)
from ..security import CurrentUser
from ..user_scope import assert_owned, expose_listing, strip_user_root, to_storage_prefix

router = APIRouter(prefix="/api/storage", tags=["storage"], dependencies=[])

FolderToken = Annotated[str | None, Depends(folder_token_header)]


def _decorate(user_id: str, items: list[dict]) -> list[dict]:
    """Merge index metadata (favorite/tags) + lock flags into listing items."""
    locked = set(db.list_locked_folders(user_id))
    for it in items:
        storage_key = to_storage_prefix(user_id, it["key"])
        if it["type"] == "folder":
            it["locked"] = storage_key in locked
        else:
            row = db.get_item(user_id, storage_key)
            it["favorite"] = bool(row["favorite"]) if row else False
            it["tags"] = (
                [t for t in row["tags"].split(",") if t] if row and row["tags"] else []
            )
    return items


@router.get("/list")
async def list_dir(
    user: CurrentUser,
    folder_token: FolderToken,
    prefix: str = "",
) -> dict:
    storage_prefix = to_storage_prefix(user.user_id, prefix)
    ensure_unlocked(storage_prefix, folder_token, user.user_id)
    result = r2.list_dir(storage_prefix)
    exposed = expose_listing(result, user.user_id)
    exposed["folders"] = _decorate(user.user_id, exposed["folders"])
    exposed["files"] = _decorate(user.user_id, exposed["files"])
    return exposed


@router.post("/folder")
async def create_folder(user: CurrentUser, body: CreateFolderRequest) -> dict:
    storage_prefix = to_storage_prefix(user.user_id, body.prefix)
    key = r2.create_folder(storage_prefix, body.name)
    return {"key": strip_user_root(user.user_id, key)}


@router.post("/upload-url", response_model=PresignUploadResponse)
async def upload_url(
    user: CurrentUser,
    folder_token: FolderToken,
    body: PresignUploadRequest,
) -> PresignUploadResponse:
    prefix = to_storage_prefix(user.user_id, body.prefix)
    ensure_unlocked(prefix, folder_token, user.user_id)
    name = r2.sanitize_segment(body.name)
    if not is_media(name):
        raise r2.StorageError(
            "Unsupported file type. Allowed: images, video and audio formats."
        )
    key = f"{prefix}{name}"
    content_type = body.content_type or content_type_for(name)
    url = r2.presign_put(key, content_type)
    return PresignUploadResponse(
        key=strip_user_root(user.user_id, key),
        url=url,
        content_type=content_type,
    )


@router.post("/upload")
async def upload_file(
    user: CurrentUser,
    folder_token: FolderToken,
    prefix: str = Form(""),
    file: UploadFile = File(...),
) -> dict:
    """Server-side upload fallback when direct browser → R2 PUT is blocked (e.g. CORS)."""
    name = r2.sanitize_segment(file.filename or "upload")
    if not is_media(name):
        raise r2.StorageError(
            "Unsupported file type. Allowed: images, video and audio formats."
        )
    storage_prefix = to_storage_prefix(user.user_id, prefix)
    ensure_unlocked(storage_prefix, folder_token, user.user_id)
    key = f"{storage_prefix}{name}"
    content_type = file.content_type or content_type_for(name)
    body = await file.read()
    r2.put_object(key, body, content_type)
    db.upsert_item(
        user.user_id,
        {
            "key": key,
            "name": name,
            "folder": r2.folder_of(key),
            "type": classify(name),
            "ext": ext_of(name),
            "size": len(body),
            "content_type": content_type,
            "last_modified": None,
        },
    )
    return {"key": strip_user_root(user.user_id, key)}


@router.post("/index-one")
async def index_one(
    user: CurrentUser,
    folder_token: FolderToken,
    body: DeleteRequest,
) -> dict:
    """Record an object in the local index after a direct-to-R2 upload."""
    key = assert_owned(user.user_id, body.key)
    ensure_unlocked(key, folder_token, user.user_id)
    if not r2.object_exists(key):
        raise r2.StorageError("Upload not found in storage.")
    name = key.split("/")[-1]
    db.upsert_item(
        user.user_id,
        {
            "key": key,
            "name": name,
            "folder": r2.folder_of(key),
            "type": classify(name),
            "ext": ext_of(name),
            "size": None,
            "content_type": content_type_for(name),
            "last_modified": None,
        },
    )
    return {"ok": True}


@router.get("/url")
async def media_url(
    user: CurrentUser,
    folder_token: FolderToken,
    key: str,
    download: bool = False,
) -> dict:
    storage_key = assert_owned(user.user_id, key)
    ensure_unlocked(storage_key, folder_token, user.user_id)
    return {"url": r2.presign_get(storage_key, download=download)}


@router.post("/delete")
async def delete(
    user: CurrentUser,
    folder_token: FolderToken,
    body: DeleteRequest,
) -> dict:
    storage_key = assert_owned(user.user_id, body.key)
    ensure_unlocked(storage_key, folder_token, user.user_id)
    deleted = r2.delete_key(storage_key)
    if storage_key.endswith("/"):
        db.delete_items_under(user.user_id, storage_key)
        db.remove_folder_lock(user.user_id, storage_key)
    else:
        db.delete_item(user.user_id, storage_key)
    return {"deleted": [strip_user_root(user.user_id, k) for k in deleted]}


@router.post("/move")
async def move(
    user: CurrentUser,
    folder_token: FolderToken,
    body: MoveRequest,
) -> dict:
    src = assert_owned(user.user_id, body.source)
    is_folder = src.endswith("/")
    base = (src.rstrip("/").split("/")[-1]) if is_folder else src.split("/")[-1]
    name = r2.sanitize_segment(body.new_name) if body.new_name else base
    dest_prefix = to_storage_prefix(user.user_id, body.destination_prefix)
    dst = f"{dest_prefix}{name}{'/' if is_folder else ''}"

    ensure_unlocked(src, folder_token, user.user_id)
    ensure_unlocked(dst, folder_token, user.user_id)

    new_key = r2.move_key(src, dst)
    if is_folder:
        db.rename_prefix(user.user_id, src, new_key)
    else:
        old = db.get_item(user.user_id, src)
        db.delete_item(user.user_id, src)
        db.upsert_item(
            user.user_id,
            {
                "key": new_key,
                "name": new_key.split("/")[-1],
                "folder": r2.folder_of(new_key),
                "type": classify(new_key),
                "ext": ext_of(new_key),
                "size": old["size"] if old else None,
                "content_type": content_type_for(new_key),
                "last_modified": old["last_modified"] if old else None,
            },
        )
    return {"key": strip_user_root(user.user_id, new_key)}


@router.post("/favorite")
async def favorite(user: CurrentUser, body: FavoriteRequest) -> dict:
    storage_key = assert_owned(user.user_id, body.key)
    db.set_favorite(user.user_id, storage_key, body.favorite)
    return {"ok": True}
