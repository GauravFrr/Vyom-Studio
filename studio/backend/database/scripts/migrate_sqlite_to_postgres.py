#!/usr/bin/env python3
"""Copy all rows from local SQLite dadaji_studio.db into PostgreSQL."""
from __future__ import annotations

import os
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_BACKEND))

from dotenv import load_dotenv

load_dotenv(_BACKEND / ".env")

SQLITE_URL = os.getenv("SQLITE_MIGRATE_FROM", f"sqlite:///{_BACKEND / 'dadaji_studio.db'}")
PG_URL = os.getenv("DATABASE_URL", "")

if not PG_URL.startswith("postgresql"):
    print("Set DATABASE_URL to a PostgreSQL connection string first.")
    sys.exit(1)

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from database.config import engine_kwargs
from models.database import Asset, GeneratedAsset, Generation, Project, Scene, Template, User

TABLES = [User, Project, Scene, Generation, Asset, Template, GeneratedAsset]


def main() -> None:
    src = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
    dst = create_engine(PG_URL, **engine_kwargs())

    if not inspect(src).get_table_names():
        print("No SQLite tables found — nothing to migrate.")
        return

    from database.session import init_db

    init_db()

    with Session(src) as s_src, Session(dst) as s_dst:
        for model in TABLES:
            rows = s_src.query(model).all()
            if not rows:
                continue
            for row in rows:
                data = {c.name: getattr(row, c.name) for c in model.__table__.columns}
                s_dst.merge(model(**data))
            print(f"  {model.__tablename__}: {len(rows)} rows")
        s_dst.commit()

    print("Migration complete.")


if __name__ == "__main__":
    main()
