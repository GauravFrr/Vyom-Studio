from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.sql import func

from database.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(120), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    email_verified = Column(Boolean, default=True, nullable=False)
    verification_token = Column(String(64), nullable=True)
    verification_expires = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    name = Column(String(200), index=True, nullable=False)
    genre = Column(String(80))
    status = Column(String(40))
    thumbnail = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    settings = Column(JSON)
    bible = Column(Text)

    __table_args__ = (Index("ix_projects_user_updated", "user_id", "updated_at"),)


class Scene(Base):
    __tablename__ = "scenes"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    scene_number = Column(Integer, index=True)
    action = Column(Text)
    mood = Column(Text)
    camera_angle = Column(Text)
    duration_sec = Column(Integer)
    prompt = Column(Text)
    negative_prompt = Column(Text)
    voiceover_text = Column(Text)
    image_path = Column(String(500))
    video_path = Column(String(500))
    status = Column(String(40))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_scenes_project_number", "project_id", "scene_number"),)


class Generation(Base):
    __tablename__ = "generations"

    id = Column(String(36), primary_key=True)
    scene_id = Column(String(36), ForeignKey("scenes.id", ondelete="CASCADE"), index=True, nullable=False)
    type = Column(String(20))
    engine = Column(String(40))
    file_path = Column(String(500))
    settings = Column(JSON)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Asset(Base):
    __tablename__ = "assets"

    id = Column(String(36), primary_key=True)
    name = Column(String(200), index=True, nullable=False)
    type = Column(String(40))
    file_path = Column(String(500))
    prompt = Column(Text)
    tags = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Template(Base):
    __tablename__ = "templates"

    id = Column(String(36), primary_key=True)
    name = Column(String(200), index=True, nullable=False)
    type = Column(String(40))
    content = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class GeneratedAsset(Base):
    """Private media owned by a user — images, videos, audio."""

    __tablename__ = "generated_assets"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    kind = Column(String(20), nullable=False)
    engine = Column(String(40), nullable=False)
    filename = Column(String(255), nullable=False)
    disk_path = Column(String(500), nullable=False)
    size_bytes = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_generated_assets_user_created", "user_id", "created_at"),)


if __name__ == "__main__":
    from database.session import init_db

    init_db()
    print("Database initialized successfully")
