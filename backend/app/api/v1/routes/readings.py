from typing import List, Any
from fastapi import APIRouter, Depends, Query, Header, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

try:
    from backend.app.services.reading_service import (
        create_reading as service_create_reading,
        get_readings_by_meter as service_get_readings_by_meter,
    )
    from backend.app.schemas.reading import ReadingCreate, ReadingResponse
    from backend.app.core.database import get_db
    from backend.app.dependencies.rate_limiter import readings_rate_limit
    from backend.app.dependencies.auth import get_current_user, require_roles
    from backend.app.repositories.reading_repository import get_reading_by_ingest_key
except Exception:
    from ...services.reading_service import (
        create_reading as service_create_reading,
        get_readings_by_meter as service_get_readings_by_meter,
    )
    from ...schemas.reading import ReadingCreate, ReadingResponse
    from ...core.database import get_db
    from ...dependencies.rate_limiter import readings_rate_limit
    from ...dependencies.auth import get_current_user, require_roles
    from ...repositories.reading_repository import get_reading_by_ingest_key

router = APIRouter(prefix="/readings", tags=["readings"])


@router.post("/", response_model=ReadingResponse)
def create_reading_route(
    reading_in: ReadingCreate,
    db: Session = Depends(get_db),
    _rl=Depends(readings_rate_limit),
    current_user: Any = Depends(require_roles("admin", "administrator", "operator")),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", max_length=128),
):
    if idempotency_key is not None and not idempotency_key.strip():
        raise HTTPException(status_code=422, detail="Idempotency-Key cannot be empty")
    key = idempotency_key.strip() if idempotency_key else None
    try:
        reading = service_create_reading(
            db,
            meter_id=reading_in.meter_id,
            timestamp=reading_in.timestamp,
            voltage=reading_in.voltage,
            current=reading_in.current,
            power_consumption=reading_in.power_consumption,
            ingest_key=key,
        )
    except IntegrityError:
        db.rollback()
        if key:
            existing = get_reading_by_ingest_key(db, key)
            if existing is not None:
                return existing
        raise HTTPException(status_code=409, detail="Reading could not be ingested")
    return reading


@router.get("/by-meter/{meter_id}", response_model=List[ReadingResponse])
def get_readings_by_meter_route(
    meter_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    return service_get_readings_by_meter(db, meter_id=meter_id, skip=skip, limit=limit)
