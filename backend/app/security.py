"""Authentication, token signing, password hashing, and path safety.

Security model
--------------
* A single master ``APP_PASSWORD`` grants a short-lived **gate token** (JWT).
  The gate token only unlocks Google sign-in — it does not grant API access.
* After Google OAuth (verified by Next.js / Auth.js), the frontend exchanges
  the gate token for a user-scoped **session token** that includes the
  Google account id in ``sub``.
* Individual folders can be protected with their own password (hashed with
  bcrypt and stored locally). Accessing a protected folder additionally
  requires a short-lived **folder-unlock token** scoped to the same user.
* R2 credentials never leave the backend. The frontend only ever receives
  short-lived presigned URLs.
"""

from __future__ import annotations

import hmac
import time
from dataclasses import dataclass
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

ALGORITHM = "HS256"
GATE_AUDIENCE = "gate"
SESSION_AUDIENCE = "session"
FOLDER_AUDIENCE = "folder-unlock"

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class UserCtx:
    user_id: str
    email: str


# --------------------------------------------------------------------------- #
# Password hashing
# --------------------------------------------------------------------------- #
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def verify_app_password(password: str) -> bool:
    """Constant-time comparison against the configured master password."""
    return hmac.compare_digest(password.encode("utf-8"), settings.app_password.encode("utf-8"))


def verify_internal_secret(header: str | None) -> None:
    if not header or not hmac.compare_digest(header, settings.internal_api_secret):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden.")


# --------------------------------------------------------------------------- #
# Token signing / verification
# --------------------------------------------------------------------------- #
def create_gate_token() -> tuple[str, int]:
    expires = int(time.time()) + settings.gate_ttl_minutes * 60
    payload = {"aud": GATE_AUDIENCE, "exp": expires, "iat": int(time.time())}
    token = jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)
    return token, expires


def create_session_token(user_id: str, email: str) -> tuple[str, int]:
    expires = int(time.time()) + settings.session_ttl_minutes * 60
    payload = {
        "aud": SESSION_AUDIENCE,
        "exp": expires,
        "iat": int(time.time()),
        "sub": user_id,
        "email": email,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)
    return token, expires


def create_folder_token(user_id: str, folders: list[str]) -> tuple[str, int]:
    expires = int(time.time()) + settings.session_ttl_minutes * 60
    payload = {
        "aud": FOLDER_AUDIENCE,
        "exp": expires,
        "iat": int(time.time()),
        "sub": user_id,
        "folders": sorted(set(folders)),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)
    return token, expires


def verify_gate_token(token: str) -> None:
    _decode(token, GATE_AUDIENCE)


def _decode(token: str, audience: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM], audience=audience)


def unlocked_folders(folder_token: str | None, user_id: str) -> set[str]:
    if not folder_token:
        return set()
    try:
        payload = _decode(folder_token, FOLDER_AUDIENCE)
    except jwt.PyJWTError:
        return set()
    if payload.get("sub") != user_id:
        return set()
    return set(payload.get("folders", []))


# --------------------------------------------------------------------------- #
# FastAPI dependencies
# --------------------------------------------------------------------------- #
def require_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> UserCtx:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = _decode(credentials.credentials, SESSION_AUDIENCE)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return UserCtx(user_id=user_id, email=payload.get("email", ""))


CurrentUser = Annotated[UserCtx, Depends(require_user)]

# Routers use this name for the authenticated-user dependency.
SessionGuard = CurrentUser
