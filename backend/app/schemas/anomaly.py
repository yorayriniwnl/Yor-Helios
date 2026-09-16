from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from .base import ORMResponseModel


class AnomalyResponse(ORMResponseModel):
    id: int
    meter_id: Optional[int] = None
    reading_id: Optional[int] = None
    type: str
    score: Optional[float] = None
    explanation: Optional[str] = None
    created_at: datetime
    severity: Optional[str] = None
