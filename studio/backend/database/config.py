"""Database connection settings."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")

DEFAULT_SQLITE_URL = "sqlite:///./dadaji_studio.db"
DEFAULT_POSTGRES_URL = "postgresql+psycopg2://vyom:vyom@localhost:5432/vyom_studio"

DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_POSTGRES_URL).strip()


def is_sqlite() -> bool:
    return DATABASE_URL.startswith("sqlite")


def is_postgres() -> bool:
    return DATABASE_URL.startswith("postgresql")


def engine_kwargs() -> dict:
    if is_sqlite():
        return {"connect_args": {"check_same_thread": False}}
    return {
        "pool_pre_ping": True,
        "pool_size": int(os.getenv("DB_POOL_SIZE", "5")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "10")),
        "connect_args": {"connect_timeout": int(os.getenv("DB_CONNECT_TIMEOUT", "5"))},
    }
