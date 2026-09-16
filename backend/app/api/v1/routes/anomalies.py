from typing import List, Optional, Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

try:
    from backend.app.repositories.anomaly_repository import (
        list_anomaly_events as repo_list_anomalies,
        list_anomaly_events_by_meter as repo_list_anomalies_by_meter,
    )
    from backend.app.schemas.anomaly import AnomalyResponse
    from backend.app.core.database import get_db
    from backend.app.dependencies.auth import get_current_user
except Exception:
    from ...repositories.anomaly_repository import list_anomaly_events as repo_list_anomalies
    from ...repositories.anomaly_repository import list_anomaly_events_by_meter as repo_list_anomalies_by_meter
    from ...schemas.anomaly import AnomalyResponse
    from ...core.database import get_db
    from ...dependencies.auth import get_current_user


router = APIRouter(prefix="/anomalies", tags=["anomalies"])


@router.get("/", response_model=List[AnomalyResponse])
def list_anomalies_route(
    meter_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    """Return recent anomaly events (newest first). Optionally filter by `meter_id`."""
    if meter_id is not None:
        return repo_list_anomalies_by_meter(db, meter_id=meter_id, skip=skip, limit=limit)
    return repo_list_anomalies(db, skip=skip, limit=limit)
