"""FastAPI application entrypoint for GigaChad Cloud."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.requests import Request

from . import __version__
from .config import settings
from .db import init_db
from .r2 import StorageError, ensure_bucket_cors
from .routers import ai, auth, folders, search, storage


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    ensure_bucket_cors()
    yield


app = FastAPI(
    title="GigaChad Cloud API",
    version=__version__,
    description="Secure personal media storage backed by Cloudflare R2.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StorageError)
async def storage_error_handler(_: Request, exc: StorageError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/api/health")
async def health() -> dict:
    return {
        "ok": True,
        "version": __version__,
        "r2_configured": settings.r2_configured,
        "openai_configured": settings.openai_configured,
        "supabase_configured": settings.supabase_configured,
    }


app.include_router(auth.router)
app.include_router(storage.router)
app.include_router(folders.router)
app.include_router(search.router)
app.include_router(ai.router)
