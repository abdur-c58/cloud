"""Request/response models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    password: str


class SessionRequest(BaseModel):
    gate_token: str
    user_id: str
    email: str
    name: str | None = None


class TokenResponse(BaseModel):
    token: str
    expires_at: int


class CreateFolderRequest(BaseModel):
    prefix: str = ""
    name: str = Field(min_length=1, max_length=200)


class PresignUploadRequest(BaseModel):
    prefix: str = ""
    name: str = Field(min_length=1, max_length=400)
    content_type: str | None = None


class PresignUploadResponse(BaseModel):
    key: str
    url: str
    content_type: str


class DeleteRequest(BaseModel):
    key: str


class MoveRequest(BaseModel):
    source: str
    destination_prefix: str
    new_name: str | None = None


class FavoriteRequest(BaseModel):
    key: str
    favorite: bool


class TagRequest(BaseModel):
    key: str
    tags: list[str] = []


class FolderLockRequest(BaseModel):
    folder: str
    password: str = Field(min_length=1, max_length=200)


class FolderUnlockRequest(BaseModel):
    folder: str
    password: str
    # An existing folder token to extend with the newly-unlocked folder.
    current_token: str | None = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str
    results: list[dict] = []


class TagSuggestRequest(BaseModel):
    key: str
