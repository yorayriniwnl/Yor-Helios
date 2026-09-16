from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

try:
    from backend.app.models.meter import Meter
except Exception:
    from ..models.meter import Meter


def create_meter(
    db: Session,
    meter_number: str,
    household_name: Optional[str] = None,
    status: str = "active",
    zone_id: Optional[int] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> Meter:
    meter = Meter(
        meter_number=meter_number,
        household_name=household_name,
        status=status,
        zone_id=zone_id,
        latitude=latitude,
        longitude=longitude,
    )
    db.add(meter)
    try:
        db.commit()
        db.refresh(meter)
    except Exception:
        db.rollback()
        raise
    return meter


def get_meter_by_id(db: Session, meter_id: int) -> Optional[Meter]:
    return db.query(Meter).filter(Meter.id == meter_id).first()


def list_meters(db: Session, skip: int = 0, limit: int = 100) -> List[Meter]:
    return db.query(Meter).offset(skip).limit(limit).all()


def count_meters(db: Session) -> int:
    """Return total number of meters."""
    try:
        return int(db.query(func.count(Meter.id)).scalar() or 0)
    except Exception:
        return 0


def list_meters_by_zone(db: Session, zone_id: int, skip: int = 0, limit: int = 100) -> List[Meter]:
    try:
        return db.query(Meter).filter(Meter.zone_id == zone_id).offset(skip).limit(limit).all()
    except Exception:
        return []


def count_meters_by_zone(db: Session, zone_id: int) -> int:
    try:
        return int(db.query(func.count(Meter.id)).filter(Meter.zone_id == zone_id).scalar() or 0)
    except Exception:
        return 0


def count_meters_grouped_by_zone(db: Session, zone_ids: list) -> dict:
    """Return a dict mapping zone_id -> meter_count for the provided zone_ids."""
    try:
        if not zone_ids:
            return {}
        rows = (
            db.query(Meter.zone_id, func.count(Meter.id).label("cnt"))
            .filter(Meter.zone_id.in_(zone_ids))
            .group_by(Meter.zone_id)
            .all()
        )
        return {int(r[0]): int(r[1]) for r in rows}
    except Exception:
        return {}
