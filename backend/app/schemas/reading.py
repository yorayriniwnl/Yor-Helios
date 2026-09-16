from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field
from .base import ORMResponseModel


class ReadingCreate(BaseModel):
    meter_id: int = Field(..., gt=0)
    timestamp: datetime
    voltage: Optional[float] = Field(None, ge=0, le=1000)
    current: Optional[float] = Field(None, ge=0, le=100000)
    power_consumption: Optional[float] = Field(None, ge=0, le=10000000)


class ReadingResponse(ORMResponseModel):
    id: int
    meter_id: int
    timestamp: datetime
    voltage: Optional[float] = None
    current: Optional[float] = None
    power_consumption: Optional[float] = None
