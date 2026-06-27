"""Folder password-lock enforcement helpers."""

from __future__ import annotations

from fastapi import Header, HTTPException, status

from . import db
from .r2 import normalize_prefix
from .security import unlocked_folders


def locking_ancestor(path: str, locked: list[str] | None = None) -> str | None:
    """Return the nearest locked folder that gates ``path`` (a key or prefix).

    A folder ``locked`` gates ``path`` when ``path`` is the folder itself or
    lives anywhere beneath it.
    """
    locked = locked if locked is not None else []
    matches = [f for f in locked if path == f or path.startswith(f)]
    if not matches:
        return None
    return max(matches, key=len)


def ensure_unlocked(path: str, folder_token: str | None, user_id: str) -> None:
    """Raise 423 (Locked) when ``path`` is gated by a folder password the
    caller has not unlocked."""
    locked = db.list_locked_folders(user_id)
    gate = locking_ancestor(path, locked)
    if gate is None:
        return
    if gate not in unlocked_folders(folder_token, user_id):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={"message": "This folder is password protected.", "folder": gate},
        )


def folder_token_header(
    x_folder_token: str | None = Header(default=None, alias="X-Folder-Token"),
) -> str | None:
    return x_folder_token


def is_locked_prefix(prefix: str, user_id: str) -> bool:
    return normalize_prefix(prefix) in set(db.list_locked_folders(user_id))
