"""Per-user storage namespace helpers.

The browser works with paths relative to a user's cloud root (e.g. ``Photos/``).
All R2 keys are stored under ``users/{user_id}/`` in the bucket.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException, status

from . import r2

_USER_SAFE = re.compile(r"[^a-zA-Z0-9._-]")


def user_root(user_id: str) -> str:
    safe = _USER_SAFE.sub("_", user_id.strip())
    if not safe:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user id.")
    return f"users/{safe}/"


def to_storage_prefix(user_id: str, prefix: str) -> str:
    return user_root(user_id) + r2.normalize_prefix(prefix)


def to_storage_key(user_id: str, key: str) -> str:
    root = user_root(user_id)
    trimmed = (key or "").strip().lstrip("/")
    if trimmed.startswith("users/"):
        full = trimmed if trimmed.endswith("/") or "/" in trimmed else trimmed
        if not full.startswith(root):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
        return full if full.endswith("/") or not key.endswith("/") else full + "/"
    return root + trimmed


def assert_owned(user_id: str, key: str) -> str:
    full = to_storage_key(user_id, key)
    r2.assert_safe_key(full)
    return full


def strip_user_root(user_id: str, key: str) -> str:
    root = user_root(user_id)
    if key.startswith(root):
        return key[len(root) :]
    return key


def expose_item(user_id: str, item: dict[str, Any]) -> dict[str, Any]:
    out = dict(item)
    if "key" in out:
        out["key"] = strip_user_root(user_id, out["key"])
    return out


def expose_listing(result: dict[str, Any], user_id: str) -> dict[str, Any]:
    root = user_root(user_id)
    prefix = result.get("prefix", "")
    relative_prefix = prefix[len(root) :] if prefix.startswith(root) else prefix
    return {
        "prefix": relative_prefix,
        "folders": [expose_item(user_id, f) for f in result.get("folders", [])],
        "files": [expose_item(user_id, f) for f in result.get("files", [])],
    }
