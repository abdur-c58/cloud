"""Indexing + search across the whole library."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from .. import db, r2
from ..locks import folder_token_header, locking_ancestor
from ..media import classify, content_type_for, ext_of, is_media
from ..schemas import TagRequest
from ..security import CurrentUser, unlocked_folders
from ..user_scope import assert_owned, strip_user_root, user_root

router = APIRouter(prefix="/api/search", tags=["search"])

FolderToken = Annotated[str | None, Depends(folder_token_header)]


@router.post("/reindex")
async def reindex(user: CurrentUser) -> dict:
    """Walk the user's storage root and refresh the metadata index."""
    prefix = user_root(user.user_id)
    objects = r2.list_all(prefix)
    count = 0
    seen: set[str] = set()
    for obj in objects:
        key = obj["key"]
        name = key.split("/")[-1]
        if not is_media(name):
            continue
        seen.add(key)
        db.upsert_item(
            user.user_id,
            {
                "key": key,
                "name": name,
                "folder": r2.folder_of(key),
                "type": classify(name),
                "ext": ext_of(name),
                "size": obj["size"],
                "content_type": content_type_for(name),
                "last_modified": obj["last_modified"],
            },
        )
        count += 1
    return {"indexed": count}


def _visible(user_id: str, rows, folder_token: str | None) -> list[dict]:
    unlocked = unlocked_folders(folder_token, user_id)
    locked = db.list_locked_folders(user_id)
    out: list[dict] = []
    for r in rows:
        gate = locking_ancestor(r["key"], locked)
        if gate is not None and gate not in unlocked:
            continue
        out.append(
            {
                "key": strip_user_root(user_id, r["key"]),
                "name": r["name"],
                "folder": strip_user_root(user_id, r["folder"]),
                "type": r["type"],
                "ext": r["ext"],
                "size": r["size"],
                "last_modified": r["last_modified"],
                "favorite": bool(r["favorite"]),
                "tags": [t for t in r["tags"].split(",") if t],
                "caption": r["caption"],
            }
        )
    return out


@router.get("")
async def search(
    user: CurrentUser,
    folder_token: FolderToken,
    q: str = "",
    type: str | None = Query(default=None),
    favorites: bool = False,
    limit: int = 200,
) -> dict:
    types = [t for t in (type.split(",") if type else []) if t]
    rows = db.search_items(
        user.user_id, query=q, types=types or None, favorites_only=favorites, limit=limit
    )
    return {"items": _visible(user.user_id, rows, folder_token)}


@router.get("/summary")
async def summary(user: CurrentUser) -> dict:
    return db.index_summary(user.user_id)


@router.post("/tags")
async def set_tags(user: CurrentUser, body: TagRequest) -> dict:
    storage_key = assert_owned(user.user_id, body.key)
    cleaned = ",".join(sorted({t.strip().lower() for t in body.tags if t.strip()}))
    db.set_tags(user.user_id, storage_key, cleaned)
    return {"ok": True, "tags": [t for t in cleaned.split(",") if t]}
