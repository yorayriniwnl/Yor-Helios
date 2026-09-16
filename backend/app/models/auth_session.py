"""Database-backed refresh sessions for revocable user access."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

try:
    from backend.app.models.base import BaseModel
except Exception:
    from .base import BaseModel


class AuthSession(BaseModel):
    __tablename__ = "auth_sessions"

    session_id = Column(String(128), nullable=False, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    refresh_token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    replaced_by = Column(String(128), nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
