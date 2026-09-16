"""Reading model."""
from sqlalchemy import Column, Integer, ForeignKey, DateTime, Float, Index, String

try:
    from backend.app.models.base import BaseModel
except Exception:
    from .base import BaseModel


class Reading(BaseModel):
    __tablename__ = "readings"

    meter_id = Column(Integer, ForeignKey("meters.id"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    voltage = Column(Float, nullable=True)
    current = Column(Float, nullable=True)
    power_consumption = Column(Float, nullable=True)
    # Optional client-provided idempotency key for retried telemetry uploads.
    ingest_key = Column(String(128), nullable=True, unique=True, index=True)

    __table_args__ = (
        Index("ix_readings_meter_timestamp", "meter_id", "timestamp"),
        Index("ix_readings_timestamp", "timestamp"),
    )
