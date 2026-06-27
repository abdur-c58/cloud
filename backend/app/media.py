"""Media type classification and content-type helpers."""

from __future__ import annotations

import os

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif",
    ".heic", ".heif", ".avif", ".svg", ".ico",
}

VIDEO_EXTENSIONS = {
    ".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".wmv", ".flv",
    ".mpeg", ".mpg", ".3gp", ".ts", ".ogv",
}

AUDIO_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".flac", ".wma",
    ".opus", ".aiff", ".alac",
}

MEDIA_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | AUDIO_EXTENSIONS

CONTENT_TYPES = {
    # images
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".tiff": "image/tiff", ".tif": "image/tiff", ".heic": "image/heic",
    ".heif": "image/heif", ".avif": "image/avif", ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    # video
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".avi": "video/x-msvideo", ".mkv": "video/x-matroska", ".m4v": "video/x-m4v",
    ".wmv": "video/x-ms-wmv", ".flv": "video/x-flv", ".mpeg": "video/mpeg",
    ".mpg": "video/mpeg", ".3gp": "video/3gpp", ".ts": "video/mp2t",
    ".ogv": "video/ogg",
    # audio
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
    ".aac": "audio/aac", ".ogg": "audio/ogg", ".oga": "audio/ogg",
    ".flac": "audio/flac", ".wma": "audio/x-ms-wma", ".opus": "audio/opus",
    ".aiff": "audio/aiff", ".alac": "audio/m4a",
}


def ext_of(name: str) -> str:
    return os.path.splitext(name)[1].lower()


def classify(name: str) -> str:
    """Return one of: folder | image | video | audio | other."""
    if name.endswith("/"):
        return "folder"
    ext = ext_of(name)
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in VIDEO_EXTENSIONS:
        return "video"
    if ext in AUDIO_EXTENSIONS:
        return "audio"
    return "other"


def content_type_for(name: str) -> str:
    return CONTENT_TYPES.get(ext_of(name), "application/octet-stream")


def is_media(name: str) -> bool:
    return ext_of(name) in MEDIA_EXTENSIONS
