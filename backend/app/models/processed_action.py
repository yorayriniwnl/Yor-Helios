"""Idempotency records for replayed offline operator actions."""

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func

try:
    from backend.app.models.base import BaseModel
except Exception:
    from .base import BaseModel


class ProcessedAction(BaseModel):
    __tablename__ = "processed_actions"

    action_id = Column(String(128), nullable=False, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    method = Column(String(16), nullable=False)
    url = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, default="applied")
    result_json = Column(String(2000), nullable=True)
    processed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
