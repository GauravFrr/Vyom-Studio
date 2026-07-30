"""
Dadaji AI Studio — FastAPI entry point.

Run locally with:
    cd studio/backend
    uvicorn main:app --reload
"""

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from core.errors import http_exception_handler, unhandled_exception_handler
from core.security import ApiAuthGateMiddleware, SecurityHeadersMiddleware

_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / ".env")

_STORAGE_PATH = Path(os.getenv("STORAGE_PATH", str(_BACKEND_DIR.parent / "storage"))).resolve()
_STORAGE_PATH.mkdir(parents=True, exist_ok=True)
(_STORAGE_PATH / "projects").mkdir(parents=True, exist_ok=True)
(_STORAGE_PATH / "assets").mkdir(parents=True, exist_ok=True)
(_STORAGE_PATH / "users").mkdir(parents=True, exist_ok=True)

_is_prod = os.getenv("ENV", "development").lower() == "production"

app = FastAPI(
    title="VYOM Studio API",
    description="Story studio API",
    version="0.1.0",
    docs_url=None if _is_prod or os.getenv("DISABLE_OPENAPI") else "/docs",
    redoc_url=None,
    openapi_url=None if _is_prod or os.getenv("DISABLE_OPENAPI") else "/openapi.json",
)

app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(ApiAuthGateMiddleware)

_cors_raw = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    from database.session import init_db
except ImportError:
    from .database.session import init_db
init_db()

try:
    from routers import story, generate, export, projects, pvt, usage, storage, auth
except ImportError:
    from .routers import story, generate, export, projects, pvt, usage, storage, auth  # type: ignore

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(story.router, prefix="/api/story", tags=["story"])
app.include_router(generate.router, prefix="/api/generate", tags=["generate"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(pvt.router, prefix="/api/pvt", tags=["pvt"])
app.include_router(usage.router, prefix="/api/usage", tags=["usage"])
app.include_router(storage.router, prefix="/api/storage", tags=["storage"])


@app.get("/")
async def root():
    return {"message": "VYOM Studio API", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}
