from typing import List, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

try:
    from backend.app.services.meter_service import (
        create_meter as service_create_meter,
        list_meters as service_list_meters,
        get_meter_by_id as service_get_meter_by_id,
    )
    from backend.app.schemas.meter import MeterCreate, MeterResponse, HighRiskMeterResponse
    from backend.app.core.database import get_db
    from backend.app.dependencies.auth import get_current_user, require_roles
except Exception:
    from ...services.meter_service import (
        create_meter as service_create_meter,
        list_meters as service_list_meters,
        get_meter_by_id as service_get_meter_by_id,
    )
    from ...schemas.meter import MeterCreate, MeterResponse, HighRiskMeterResponse
    from ...core.database import get_db
    from ...dependencies.auth import get_current_user, require_roles

router = APIRouter(prefix="/meters", tags=["meters"])


@router.post("/", response_model=MeterResponse)
def create_meter_route(meter_in: MeterCreate, db: Session = Depends(get_db), current_user: Any = Depends(require_roles("admin", "administrator"))):
    meter = service_create_meter(
        db,
        meter_number=meter_in.meter_number,
        household_name=meter_in.household_name,
        status=meter_in.status,
        zone_id=meter_in.zone_id,
        latitude=meter_in.latitude,
        longitude=meter_in.longitude,
    )
    return meter


@router.get("/", response_model=List[MeterResponse])
def list_meters_route(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    return service_list_meters(db, skip=skip, limit=limit)


# ── IMPORTANT: static path segments must come BEFORE /{meter_id} ──────────
# FastAPI evaluates routes in declaration order; declaring /{meter_id} first
# would shadow /high-risk and /by-zone/{zone_id}.

@router.get("/high-risk", response_model=List[HighRiskMeterResponse])
def get_high_risk_meters_route(
    window_hours: int = Query(24, ge=1, le=168),
    threshold: int = Query(5, ge=1, le=100000),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    try:
        from backend.app.services.high_risk_service import get_high_risk_meters as svc_high_risk
    except Exception:
        from ...services.high_risk_service import get_high_risk_meters as svc_high_risk

    try:
        results = svc_high_risk(db, window_hours=window_hours, threshold=threshold, limit=limit)
        return [{"meter_id": r.get("meter_id"), "count": r.get("count")} for r in results]
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to compute high-risk meters")


@router.get("/by-zone/{zone_id}", response_model=List[MeterResponse])
def get_meters_by_zone_route(
    zone_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    try:
        from backend.app.repositories.meter_repository import list_meters_by_zone as repo_list_meters_by_zone
    except Exception:
        from ...repositories.meter_repository import list_meters_by_zone as repo_list_meters_by_zone

    return repo_list_meters_by_zone(db, zone_id=zone_id, skip=skip, limit=limit)


@router.get("/{meter_id}", response_model=MeterResponse)
def get_meter_route(meter_id: int, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    meter = service_get_meter_by_id(db, meter_id)
    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")
    return meter
