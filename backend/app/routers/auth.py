"""Authentication endpoints."""

from __future__ import annotations

import jwt
from fastapi import APIRouter, Header, HTTPException, status

from .. import db
from ..schemas import LoginRequest, SessionRequest, TokenResponse
from ..security import (
    create_gate_token,
    create_session_token,
    verify_app_password,
    verify_gate_token,
    verify_internal_secret,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest) -> TokenResponse:
    """Verify the master password and return a short-lived gate token."""
    if not verify_app_password(body.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password."
        )
    token, expires = create_gate_token()
    return TokenResponse(token=token, expires_at=expires)


@router.post("/session", response_model=TokenResponse)
async def create_user_session(
    body: SessionRequest,
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
) -> TokenResponse:
    """Exchange a gate token + verified Google identity for a user-scoped API session."""
    verify_internal_secret(x_internal_secret)
    try:
        verify_gate_token(body.gate_token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired gate."
        ) from exc
    if not body.user_id or not body.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing user info.")
    db.upsert_user(body.user_id, body.email, body.name)
    token, expires = create_session_token(body.user_id, body.email)
    return TokenResponse(token=token, expires_at=expires)
