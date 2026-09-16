from typing import Optional
from pydantic import BaseModel, Field
from .base import ORMResponseModel


class MeterCreate(BaseModel):
    meter_number: str = Field(..., min_length=1, max_length=100)
    household_name: Optional[str] = Field(None, max_length=255)
    status: str = Field("active", min_length=1, max_length=50)
    zone_id: Optional[int] = Field(None, gt=0)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)


class MeterResponse(ORMResponseModel):
    id: int
    meter_number: str
    household_name: Optional[str] = None
    status: str
    zone_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class HighRiskMeterResponse(ORMResponseModel):
    meter_id: int
    count: int
