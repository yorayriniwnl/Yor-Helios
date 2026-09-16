from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

try:
    from backend.app.core.database import get_db
    from backend.app.schemas.recommendation import RecommendationResponse
    from backend.app.services.recommendation_service import get_recommendation_for_alert as svc_recommend
    from backend.app.dependencies.auth import get_current_user
except Exception:
    from ...core.database import get_db
    from ...schemas.recommendation import RecommendationResponse
    from ...services.recommendation_service import get_recommendation_for_alert as svc_recommend
    from ...dependencies.auth import get_current_user


router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("/", response_model=RecommendationResponse)
def recommendation_route(
    alert_id: Optional[int] = None,
    meter_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    """Return a human-friendly recommendation for the supplied alert or meter.

    Priority: if `alert_id` provided, compute recommendation from the alert.
    Otherwise, fall back to a generic meter-based monitoring recommendation.
    """
    try:
        if alert_id is not None:
            res = svc_recommend(db, int(alert_id))
            return RecommendationResponse(**res)

        # fallback: simple guidance for a meter input
        if meter_id is not None:
            # create a minimal payload returned as monitor recommendation
            res = {
                "primary_action": "inspect_meter",
                "action_text": "Inspect the meter and validate device health.",
                "reason": "Operator requested guidance for specified meter.",
                "confidence": 0.5,
                "meter_id": meter_id,
                "zone_id": None,
                "alternatives": ["monitor_zone"],
            }
            return RecommendationResponse(**res)

        raise HTTPException(status_code=400, detail="Provide alert_id or meter_id")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to compute recommendation")
