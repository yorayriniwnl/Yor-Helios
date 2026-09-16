from typing import Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

try:
    from backend.app.services.dashboard_service import get_summary as service_get_summary
    from backend.app.core.database import get_db
    from backend.app.services.dashboard_service import get_recovery_metrics as service_get_recovery
    from backend.app.services.risk_service import get_risk_summary as service_get_risk
    from backend.app.dependencies.auth import get_current_user
except Exception:
    from ...services.dashboard_service import get_summary as service_get_summary
    from ...core.database import get_db
    from ...services.dashboard_service import get_recovery_metrics as service_get_recovery
    from ...services.risk_service import get_risk_summary as service_get_risk
    from ...dependencies.auth import get_current_user


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_dashboard_summary(db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    return service_get_summary(db)


@router.get("/recovery")
def get_recovery_dashboard(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    return service_get_recovery(db, days=days)


@router.get("/risk")
def get_risk_overview(
    window_days: int = Query(7, ge=1, le=365),
    top_n: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    """Return predictive risk summary for meters and zones.

    Query params:
    - `window_days`: int, lookback window in days to weigh anomalies (default 7)
    - `top_n`: int, number of top candidate meters to return (default 20)
    """
    return service_get_risk(db, window_days=window_days, top_n=top_n)
