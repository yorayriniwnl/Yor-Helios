from typing import List, Optional
import json
from sqlalchemy.orm import Session

try:
    from backend.app.repositories.reading_repository import (
        create_reading as repo_create_reading,
        get_readings_by_meter as repo_get_readings_by_meter,
        get_latest_reading as repo_get_latest_reading,
    )
except Exception:
    from ..repositories.reading_repository import (
        create_reading as repo_create_reading,
        get_readings_by_meter as repo_get_readings_by_meter,
        get_latest_reading as repo_get_latest_reading,
    )

try:
    from backend.app.services.anomaly_service import detect_anomalies
    from backend.app.services.alert_service import create_alert as svc_create_alert
except Exception:
    from .anomaly_service import detect_anomalies
    from .alert_service import create_alert as svc_create_alert

try:
    from backend.app.services.websocket_service import broadcast_sync as ws_broadcast_sync
except Exception:
    from .websocket_service import broadcast_sync as ws_broadcast_sync

try:
    from backend.app.core.cache import set_cache
except Exception:
    from ..core.cache import set_cache


def create_reading(
    db: Session,
    meter_id: int,
    timestamp,
    voltage: Optional[float] = None,
    current: Optional[float] = None,
    power_consumption: Optional[float] = None,
    ingest_key: Optional[str] = None,
):
    # fetch previous reading (if any) to improve anomaly detection
    previous = repo_get_latest_reading(db, meter_id)

    reading = repo_create_reading(
        db,
        meter_id=meter_id,
        timestamp=timestamp,
        voltage=voltage,
        current=current,
        power_consumption=power_consumption,
        ingest_key=ingest_key,
    )

    # run anomaly detection and create alerts for any findings
    try:
        result = detect_anomalies(reading, previous_reading=previous, db=db)
        # Support both legacy (list) and new (dict) return formats
        if isinstance(result, dict):
            anomalies = result.get("anomalies", [])
        else:
            anomalies = result

        for a in anomalies:
            try:
                svc_create_alert(db, meter_id=getattr(reading, "meter_id", None), reading_id=getattr(reading, "id", None), type=a.get("type"), score=a.get("score"), explanation=a.get("explanation"))
            except Exception:
                # keep ingestion robust; don't fail on alert creation
                pass
    except Exception:
        # anomaly detection should not break ingestion
        pass

    # push reading to connected websocket clients (best-effort, non-blocking)
    # and cache latest reading per meter in Redis
    try:
        data = {
            "id": getattr(reading, "id", None),
            "meter_id": getattr(reading, "meter_id", None),
            "timestamp": getattr(reading, "timestamp").isoformat() if getattr(reading, "timestamp", None) is not None else None,
            "voltage": getattr(reading, "voltage", None),
            "current": getattr(reading, "current", None),
            "power_consumption": getattr(reading, "power_consumption", None),
        }
        try:
            ws_broadcast_sync(json.dumps({"type": "reading", "data": data}))
        except Exception:
            pass

        # Cache latest reading for this meter (best-effort)
        try:
            meter_id_val = getattr(reading, "meter_id", None)
            key = f"meter:{meter_id_val}:latest"
            try:
                set_cache(key, data)
            except Exception:
                pass
        except Exception:
            pass
    except Exception:
        pass

    return reading


def get_readings_by_meter(db: Session, meter_id: int, skip: int = 0, limit: int = 100) -> List:
    return repo_get_readings_by_meter(db, meter_id=meter_id, skip=skip, limit=limit)


def get_latest_reading(db: Session, meter_id: int):
    return repo_get_latest_reading(db, meter_id)
