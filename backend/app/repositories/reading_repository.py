from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func

try:
    from backend.app.models.reading import Reading
except Exception:
    from ..models.reading import Reading


def create_reading(
    db: Session,
    meter_id: int,
    timestamp: datetime,
    voltage: Optional[float] = None,
    current: Optional[float] = None,
    power_consumption: Optional[float] = None,
    ingest_key: Optional[str] = None,
) -> Reading:
    """Create and return a new Reading record."""
    reading = Reading(
        meter_id=meter_id,
        timestamp=timestamp,
        voltage=voltage,
        current=current,
        power_consumption=power_consumption,
        ingest_key=ingest_key,
    )
    db.add(reading)
    try:
        db.commit()
        db.refresh(reading)
    except Exception:
        db.rollback()
        raise
    return reading


def get_reading_by_ingest_key(db: Session, ingest_key: str) -> Optional[Reading]:
    return db.query(Reading).filter(Reading.ingest_key == ingest_key).first()


def get_readings_by_meter(db: Session, meter_id: int, skip: int = 0, limit: int = 100) -> List[Reading]:
    """Return readings for a given meter ordered by timestamp ascending."""
    return (
        db.query(Reading)
        .filter(Reading.meter_id == meter_id)
        .order_by(Reading.timestamp)
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_latest_reading(db: Session, meter_id: int) -> Optional[Reading]:
    """Return the latest reading for a given meter, or None."""
    return (
        db.query(Reading)
        .filter(Reading.meter_id == meter_id)
        .order_by(Reading.timestamp.desc())
        .first()
    )


def count_readings(db: Session) -> int:
    """Return total number of readings."""
    try:
        return int(db.query(func.count(Reading.id)).scalar() or 0)
    except Exception:
        return 0


def sum_power_by_meter_ids_since(db: Session, meter_ids: list, since) -> float:
    """Return the sum of `power_consumption` for given meter_ids from `since` timestamp."""
    try:
        if not meter_ids:
            return 0.0
        s = db.query(func.sum(Reading.power_consumption)).filter(Reading.meter_id.in_(meter_ids), Reading.timestamp >= since).scalar()
        return float(s or 0.0)
    except Exception:
        return 0.0


def voltage_stats_by_meter_ids_since(db: Session, meter_ids: list, since) -> dict:
    """Return voltage statistics for given meter_ids since `since` timestamp.

    Returns dict: {"mean": float, "stddev": float, "count": int, "out_of_range_frac": float}
    """
    try:
        if not meter_ids:
            return {"mean": 0.0, "stddev": 0.0, "count": 0, "out_of_range_frac": 0.0}

        # Try to compute via SQL aggregates
        try:
            from sqlalchemy import func
            res = db.query(func.avg(Reading.voltage), func.stddev_pop(Reading.voltage), func.count(Reading.voltage)).filter(Reading.meter_id.in_(meter_ids), Reading.timestamp >= since).one()
            mean = float(res[0] or 0.0)
            std = float(res[1] or 0.0)
            cnt = int(res[2] or 0)
        except Exception:
            # Fallback: fetch values and compute in Python
            rows = db.query(Reading.voltage).filter(Reading.meter_id.in_(meter_ids), Reading.timestamp >= since).all()
            vals = [r[0] for r in rows if r and r[0] is not None]
            if vals:
                import statistics

                mean = float(statistics.mean(vals))
                std = float(statistics.pstdev(vals) if len(vals) > 1 else 0.0)
                cnt = len(vals)
            else:
                return {"mean": 0.0, "stddev": 0.0, "count": 0, "out_of_range_frac": 0.0}

        # compute fraction outside 5% band around mean
        out_frac = 0.0
        if cnt > 0 and mean != 0.0:
            try:
                thresh = abs(mean) * 0.05
                rows = db.query(Reading.voltage).filter(Reading.meter_id.in_(meter_ids), Reading.timestamp >= since).all()
                vals = [r[0] for r in rows if r and r[0] is not None]
                if vals:
                    out = sum(1 for v in vals if abs(v - mean) > thresh)
                    out_frac = float(out) / float(len(vals))
            except Exception:
                out_frac = 0.0

        return {"mean": mean, "stddev": std, "count": cnt, "out_of_range_frac": round(min(1.0, max(0.0, out_frac)), 3)}
    except Exception:
        return {"mean": 0.0, "stddev": 0.0, "count": 0, "out_of_range_frac": 0.0}
