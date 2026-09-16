from datetime import datetime
from typing import Optional, Dict, Any, List

from pydantic import BaseModel, Field

from .anomaly import AnomalyResponse
from .meter import MeterResponse
from .reading import ReadingResponse
from .zone import ZoneResponse
from .base import ORMResponseModel


class AlertResponse(ORMResponseModel):
    id: int
    meter_id: Optional[int] = None
    reading_id: Optional[int] = None
    type: str
    score: Optional[float] = None
    explanation: Optional[str] = None
    assigned_to: Optional[int] = None
    status: str
    severity: Optional[str] = "medium"
    responded_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None
    sla_breached: Optional[bool] = False
    created_at: datetime
    decision: Optional[Dict[str, Any]] = None

class PriorityAlertResponse(ORMResponseModel):
    id: int
    meter_id: Optional[int] = None
    type: str
    score: Optional[float] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    priority_score: float
    components: Dict[str, Any]

class InvestigationEvidenceResponse(ORMResponseModel):
    id: int
    alert_id: int
    original_filename: Optional[str] = None
    file_url: str
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    evidence_ts: Optional[datetime] = None
    notes: Optional[str] = None
    before_after: Optional[str] = None
    created_at: datetime


class InvestigationTimelineEvent(ORMResponseModel):
    event: str
    at: datetime
    actor_id: Optional[int] = None
    detail: Optional[str] = None
    source: str = "system"


class InvestigationContext(ORMResponseModel):
    detector: str
    score_band: str
    score_is_probability: bool = False
    evidence_state: str
    observed_signals: List[str] = Field(default_factory=list)
    possible_causes: List[str] = Field(default_factory=list)
    uncertainty: List[str] = Field(default_factory=list)
    recommended_response: str


class AlertInvestigationResponse(ORMResponseModel):
    alert: AlertResponse
    meter: Optional[MeterResponse] = None
    zone: Optional[ZoneResponse] = None
    reading: Optional[ReadingResponse] = None
    anomalies: List[AnomalyResponse] = Field(default_factory=list)
    evidence: List[InvestigationEvidenceResponse] = Field(default_factory=list)
    timeline: List[InvestigationTimelineEvent] = Field(default_factory=list)
    investigation: InvestigationContext
