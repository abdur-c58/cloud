"""Cloudflare R2 (S3-compatible) access layer.

All bucket credentials live here and never leave the backend. Browsers receive
only short-lived presigned URLs for direct upload/streaming/download.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

import boto3
from botocore.client import Config

from .config import settings
from .media import classify, content_type_for

_KEY_SAFE = re.compile(r"[\x00-\x1f\x7f]")


class StorageError(Exception):
    """Raised for invalid storage operations (mapped to HTTP 400)."""


@lru_cache
def _client():
    if not settings.r2_configured:
        raise StorageError(
            "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, "
            "R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME."
        )
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


# --------------------------------------------------------------------------- #
# Path helpers / safety
# --------------------------------------------------------------------------- #
def normalize_prefix(prefix: str) -> str:
    trimmed = (prefix or "").strip().lstrip("/")
    if not trimmed:
        return ""
    return trimmed if trimmed.endswith("/") else trimmed + "/"


def sanitize_segment(name: str) -> str:
    name = (name or "").strip().replace("\\", "/")
    name = name.split("/")[-1]
    if name in ("", ".", "..") or _KEY_SAFE.search(name):
        raise StorageError("Invalid name.")
    return name


def assert_safe_key(key: str) -> None:
    if not key or ".." in key.split("/") or _KEY_SAFE.search(key):
        raise StorageError("Invalid key.")


def folder_of(key: str) -> str:
    """Return the containing folder prefix of a key (e.g. 'a/b/c.jpg' -> 'a/b/')."""
    k = key.rstrip("/")
    if "/" not in k:
        return ""
    return k.rsplit("/", 1)[0] + "/"


# --------------------------------------------------------------------------- #
# Listing
# --------------------------------------------------------------------------- #
def list_dir(prefix: str = "") -> dict[str, Any]:
    """List immediate folders + files under a prefix using the delimiter."""
    normalized = normalize_prefix(prefix)
    client = _client()
    paginator = client.get_paginator("list_objects_v2")

    folders: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []

    for page in paginator.paginate(
        Bucket=settings.r2_bucket_name, Prefix=normalized, Delimiter="/"
    ):
        for cp in page.get("CommonPrefixes", []) or []:
            key = cp.get("Prefix", "")
            if not key:
                continue
            name = key[len(normalized):].rstrip("/")
            folders.append(
                {
                    "key": key,
                    "name": name,
                    "type": "folder",
                    "size": None,
                    "last_modified": None,
                }
            )
        for obj in page.get("Contents", []) or []:
            key = obj.get("Key", "")
            if key == normalized or key.endswith("/"):
                continue  # the placeholder object for the folder itself
            name = key[len(normalized):]
            files.append(
                {
                    "key": key,
                    "name": name,
                    "type": classify(name),
                    "size": obj.get("Size"),
                    "last_modified": obj.get("LastModified").isoformat()
                    if obj.get("LastModified")
                    else None,
                }
            )

    folders.sort(key=lambda f: f["name"].lower())
    files.sort(key=lambda f: f["name"].lower())
    return {"prefix": normalized, "folders": folders, "files": files}


def list_all(prefix: str = "") -> list[dict[str, Any]]:
    """Flat listing of every object under a prefix (used for indexing/move)."""
    normalized = normalize_prefix(prefix)
    client = _client()
    paginator = client.get_paginator("list_objects_v2")
    out: list[dict[str, Any]] = []
    for page in paginator.paginate(Bucket=settings.r2_bucket_name, Prefix=normalized):
        for obj in page.get("Contents", []) or []:
            key = obj.get("Key", "")
            if key.endswith("/"):
                continue
            out.append(
                {
                    "key": key,
                    "size": obj.get("Size"),
                    "last_modified": obj.get("LastModified").isoformat()
                    if obj.get("LastModified")
                    else None,
                }
            )
    return out


def object_exists(key: str) -> bool:
    client = _client()
    try:
        client.head_object(Bucket=settings.r2_bucket_name, Key=key)
        return True
    except client.exceptions.ClientError:
        return False


# --------------------------------------------------------------------------- #
# Mutations
# --------------------------------------------------------------------------- #
def create_folder(prefix: str, name: str) -> str:
    folder_name = sanitize_segment(name)
    key = f"{normalize_prefix(prefix)}{folder_name}/"
    _client().put_object(Bucket=settings.r2_bucket_name, Key=key, Body=b"")
    return key


def delete_key(key: str) -> list[str]:
    """Delete a single object or, for a folder key, everything beneath it."""
    assert_safe_key(key)
    client = _client()
    deleted: list[str] = []
    if key.endswith("/"):
        objects = list_all(key)
        keys = [{"Key": o["key"]} for o in objects] + [{"Key": key}]
        for i in range(0, len(keys), 1000):
            batch = keys[i : i + 1000]
            client.delete_objects(
                Bucket=settings.r2_bucket_name, Delete={"Objects": batch}
            )
            deleted += [b["Key"] for b in batch]
    else:
        client.delete_object(Bucket=settings.r2_bucket_name, Key=key)
        deleted.append(key)
    return deleted


def _copy(src: str, dst: str) -> None:
    client = _client()
    client.copy_object(
        Bucket=settings.r2_bucket_name,
        CopySource={"Bucket": settings.r2_bucket_name, "Key": src},
        Key=dst,
    )


def move_key(src: str, dst: str) -> str:
    """Move/rename an object or a whole folder subtree."""
    assert_safe_key(src)
    assert_safe_key(dst)
    if src == dst:
        raise StorageError("Source and destination are identical.")
    client = _client()

    if src.endswith("/"):
        if dst.startswith(src):
            raise StorageError("Cannot move a folder into itself.")
        objects = list_all(src)
        # copy children
        for obj in objects:
            rel = obj["key"][len(src):]
            _copy(obj["key"], f"{dst}{rel}")
        # ensure folder placeholder exists at destination
        client.put_object(Bucket=settings.r2_bucket_name, Key=dst, Body=b"")
        # remove originals
        delete_key(src)
        return dst

    _copy(src, dst)
    client.delete_object(Bucket=settings.r2_bucket_name, Key=src)
    return dst


# --------------------------------------------------------------------------- #
# Presigned URLs
# --------------------------------------------------------------------------- #
def presign_get(key: str, download: bool = False) -> str:
    assert_safe_key(key)
    params: dict[str, Any] = {"Bucket": settings.r2_bucket_name, "Key": key}
    filename = key.split("/")[-1]
    if download:
        params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'
    else:
        params["ResponseContentDisposition"] = "inline"
        params["ResponseContentType"] = content_type_for(filename)
    return _client().generate_presigned_url(
        "get_object", Params=params, ExpiresIn=settings.presign_ttl_seconds
    )


def presign_put(key: str, content_type: str | None = None) -> str:
    assert_safe_key(key)
    # Do not bind ContentType into the signature — browsers must send the exact
    # header that was signed or the request fails (often surfaced as a network error).
    params: dict[str, Any] = {"Bucket": settings.r2_bucket_name, "Key": key}
    return _client().generate_presigned_url(
        "put_object", Params=params, ExpiresIn=settings.presign_ttl_seconds
    )


def put_object(key: str, body: bytes, content_type: str | None = None) -> None:
    assert_safe_key(key)
    extra: dict[str, Any] = {}
    if content_type:
        extra["ContentType"] = content_type
    _client().put_object(Bucket=settings.r2_bucket_name, Key=key, Body=body, **extra)


def ensure_bucket_cors() -> None:
    """Apply CORS rules so browser PUT/GET to presigned R2 URLs works."""
    if not settings.r2_configured:
        return
    origins = settings.origins or ["http://localhost:3000", "http://127.0.0.1:3000"]
    try:
        _client().put_bucket_cors(
            Bucket=settings.r2_bucket_name,
            CORSConfiguration={
                "CORSRules": [
                    {
                        "AllowedHeaders": ["*"],
                        "AllowedMethods": ["GET", "PUT", "POST", "HEAD", "DELETE"],
                        "AllowedOrigins": origins,
                        "ExposeHeaders": ["ETag", "Content-Length"],
                        "MaxAgeSeconds": 86400,
                    }
                ]
            },
        )
    except Exception:
        # Bucket may not allow CORS updates with current credentials — uploads
        # can still work if CORS was configured manually in the Cloudflare dashboard.
        pass
