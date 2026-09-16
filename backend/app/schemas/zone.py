from typing import Optional
from pydantic import BaseModel, Field
from .base import ORMResponseModel


class ZoneCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    city: Optional[str] = Field(None, max_length=255)
    state: Optional[str] = Field(None, max_length=100)


class ZoneResponse(ORMResponseModel):
    id: int
    name: str
    city: Optional[str] = None
    state: Optional[str] = None

class ZoneOverview(ORMResponseModel):
    """Zone with enriched runtime metrics — returned by /zones/overview."""
    id: int
    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    meter_count: int = 0
    alert_count: int = 0
    anomaly_count: int = 0
    anomaly_density: float = 0.0
    zone_loss_percentage: float = 0.0
    risk: str = "low"
