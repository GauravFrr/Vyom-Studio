"""Single source of truth for studio/storage — must match main.py StaticFiles mount."""
from __future__ import annotations

import os
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent
STORAGE_ROOT = Path(
    os.getenv("STORAGE_PATH", str(_BACKEND_DIR.parent / "storage"))
).resolve()


def ensure_dir(*parts: str) -> Path:
    path = STORAGE_ROOT.joinpath(*parts)
    path.mkdir(parents=True, exist_ok=True)
    return path
