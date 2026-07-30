"""Engine, sessions, and schema bootstrap."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from database.base import Base
from database.config import DATABASE_URL, engine_kwargs, is_postgres, is_sqlite

logger = logging.getLogger(__name__)

engine = create_engine(DATABASE_URL, **engine_kwargs())
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _import_models() -> None:
    """Register all ORM models on Base.metadata."""
    import models.database  # noqa: F401


def _run_alembic_upgrade() -> bool:
    try:
        from alembic import command
        from alembic.config import Config

        ini_path = Path(__file__).resolve().parent.parent / "alembic.ini"
        if not ini_path.is_file():
            return False
        cfg = Config(str(ini_path))
        command.upgrade(cfg, "head")
        return True
    except Exception as exc:
        logger.warning("Alembic upgrade skipped: %s", exc)
        return False


def _legacy_sqlite_patches() -> None:
    """One-off column adds for old SQLite files (pre-Alembic)."""
    if not is_sqlite():
        return
    insp = inspect(engine)
    if "projects" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("projects")}
        if "user_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE projects ADD COLUMN user_id VARCHAR"))
    if "users" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("users")}
        with engine.begin() as conn:
            if "email_verified" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 1"))
            if "verification_token" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN verification_token VARCHAR"))
            if "verification_expires" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN verification_expires DATETIME"))


def init_db() -> None:
    _import_models()
    try:
        if is_postgres():
            if not _run_alembic_upgrade():
                Base.metadata.create_all(bind=engine)
        else:
            Base.metadata.create_all(bind=engine)
            _legacy_sqlite_patches()
    except Exception as exc:
        if is_postgres():
            logger.error(
                "PostgreSQL is not reachable. Either:\n"
                "  1. Start Docker:  cd studio/database && docker compose up -d\n"
                "  2. Use Neon/Supabase connection string in DATABASE_URL\n"
                "  3. Temporarily use SQLite: DATABASE_URL=sqlite:///./dadaji_studio.db\n"
                "Error: %s",
                exc,
            )
        raise
