from typing import List, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

try:
    from backend.app.services.zone_service import (
        create_zone as service_create_zone,
        list_zones as service_list_zones,
        get_zone as service_get_zone,
        list_zones_overview as service_list_zones_overview,
    )
    from backend.app.schemas.zone import ZoneCreate, ZoneResponse, ZoneOverview
    from backend.app.core.database import get_db
    from backend.app.dependencies.auth import get_current_user, require_roles
except Exception:
    from ...services.zone_service import (
        create_zone as service_create_zone,
        list_zones as service_list_zones,
        get_zone as service_get_zone,
        list_zones_overview as service_list_zones_overview,
    )
    from ...schemas.zone import ZoneCreate, ZoneResponse, ZoneOverview
    from ...core.database import get_db
    from ...dependencies.auth import get_current_user, require_roles


router = APIRouter(prefix="/zones", tags=["zones"])


@router.post("/", response_model=ZoneResponse)
def create_zone_route(
    zone_in: ZoneCreate,
    db: Session = Depends(get_db),
    current_user: object = Depends(require_roles("admin", "administrator")),
):
    zone = service_create_zone(db, name=zone_in.name, city=zone_in.city, state=zone_in.state)
    return zone


@router.get("/", response_model=List[ZoneResponse])
def list_zones_route(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    return service_list_zones(db, skip=skip, limit=limit)


# ── IMPORTANT: /overview must be declared before /{zone_id} ──────────────────
# FastAPI resolves routes in declaration order; putting /{zone_id} first would
# cause GET /zones/overview to be captured as zone_id="overview" → 422 error.

@router.get("/overview", response_model=List[ZoneOverview])
def zones_overview_route(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    """Return zones with enriched metrics for heatmap / dashboard widgets."""
    return service_list_zones_overview(db, skip=skip, limit=limit)


@router.get("/{zone_id}", response_model=ZoneResponse)
def get_zone_route(zone_id: int, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    zone = service_get_zone(db, zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return zone
