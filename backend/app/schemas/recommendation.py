from typing import Optional
from pydantic import BaseModel
from .base import ORMResponseModel


class RecommendationResponse(ORMResponseModel):
    primary_action: str
    action_text: str
    reason: str
    confidence: float
    meter_id: Optional[int] = None
    zone_id: Optional[int] = None
    alternatives: Optional[list] = []
