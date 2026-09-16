"""Demo-only endpoint for the scripted "shock moment" presentation beat.

See docs/demo_shock_moment.md. This creates one deliberately dramatic,
high-value alert on an existing meter and broadcasts it over the same
websocket channel real readings/alerts use, so it shows up live in the UI
exactly like organic activity would. Disabled outside development so it
can't be hit in a real deployment.
"""
from datetime import datetime

from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

try:
    from backend.app.core.database import get_db
    from backend.app.core.config import settings
    from backend.app.models.meter import Meter
    from backend.app.repositories.reading_repository import create_reading as repo_create_reading
    from backend.app.services.alert_service import create_alert as svc_create_alert
    from backend.app.schemas.alert import AlertResponse
    from backend.app.dependencies.auth import get_current_user, require_roles
except Exception:
    from ...core.database import get_db
    from ...core.config import settings
    from ...models.meter import Meter
    from ...repositories.reading_repository import create_reading as repo_create_reading
    from ...services.alert_service import create_alert as svc_create_alert
    from ...schemas.alert import AlertResponse
    from ...dependencies.auth import get_current_user, require_roles

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/trigger_alert", response_model=AlertResponse)
def trigger_demo_alert(db: Session = Depends(get_db), current_user: Any = Depends(require_roles("admin", "administrator", "operator"))):
    if getattr(settings, "ENV", "development") == "production":
        raise HTTPException(status_code=404, detail="Not found")

    meter = db.query(Meter).first()
    if meter is None:
        raise HTTPException(status_code=400, detail="No meters available to attach a demo alert to")

    reading = repo_create_reading(
        db,
        meter_id=meter.id,
        timestamp=datetime.utcnow(),
        voltage=231.5,
        current=18.2,
        power_consumption=4212.5,
    )
    alert = svc_create_alert(
        db,
        meter_id=meter.id,
        reading_id=reading.id,
        type="tamper_suspicion",
        score=0.97,
        explanation=(
            f"Sustained under-reporting with a suspected bypass signature on meter "
            f"{meter.meter_number}. Estimated recoverable impact: 1,500 kWh "
            f"(approx. \u20b910,500)."
        ),
    )
    return alert
