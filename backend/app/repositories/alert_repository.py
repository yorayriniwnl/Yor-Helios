from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func

try:
    from backend.app.models.alert import Alert
except Exception:
    from ..models.alert import Alert


try:
    from backend.app.models.meter import Meter
except Exception:
    from ..models.meter import Meter


def create_alert(db: Session, meter_id: Optional[int], reading_id: Optional[int], type: str, score: Optional[float], explanation: Optional[str], severity: str = "medium") -> Alert:
    alert = Alert(
        meter_id=meter_id,
        reading_id=reading_id,
        type=type,
        score=score,
        explanation=explanation,
        severity=severity,
    )
    db.add(alert)
    try:
        db.commit()
        db.refresh(alert)
    except Exception:
        db.rollback()
        raise
    return alert


def count_alerts(db: Session) -> int:
    """Return total number of alerts."""
    try:
        return int(db.query(func.count(Alert.id)).scalar() or 0)
    except Exception:
        return 0


def count_open_alerts(db: Session) -> int:
    """Return alerts that still require operator attention."""
    try:
        return int(
            db.query(func.count(Alert.id))
            .filter(Alert.status.in_(("open", "assigned", "investigating")))
            .scalar()
            or 0
        )
    except Exception:
        return 0


def count_critical_alerts(db: Session) -> int:
    """Return open critical alerts for the command-center KPI."""
    try:
        return int(
            db.query(func.count(Alert.id))
            .filter(
                Alert.status.in_(("open", "assigned", "investigating")),
                Alert.severity == "critical",
            )
            .scalar()
            or 0
        )
    except Exception:
        return 0


def count_alerts_by_zone(db: Session, zone_id: int) -> int:
    """Return total number of alerts for meters in the given zone."""
    try:
        return int(
            db.query(func.count(Alert.id))
            .join(Meter, Alert.meter_id == Meter.id)
            .filter(Meter.zone_id == zone_id)
            .scalar()
            or 0
        )
    except Exception:
        return 0


def count_alerts_grouped_by_zone(db: Session, zone_ids: list) -> dict:
    """Return a dict mapping zone_id -> alert_count for the provided zone_ids."""
    try:
        if not zone_ids:
            return {}
        from sqlalchemy import func

        rows = (
            db.query(Meter.zone_id, func.count(Alert.id).label("cnt"))
            .join(Meter, Alert.meter_id == Meter.id)
            .filter(Meter.zone_id.in_(zone_ids))
            .group_by(Meter.zone_id)
            .all()
        )
        return {int(r[0]): int(r[1]) for r in rows}
    except Exception:
        return {}


def assign_alert(db: Session, alert_id: int, user_id: int) -> Optional[Alert]:
    """Assign an alert to a user, set responded_at and mark status as 'assigned'."""
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if not alert:
            return None
        alert.assigned_to = user_id
        alert.status = "assigned"
        alert.responded_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(alert)
        return alert
    except Exception:
        db.rollback()
        return None


def resolve_alert(db: Session, alert_id: int, notes: Optional[str]) -> Optional[Alert]:
    """Mark an alert as resolved, set resolved_at and store notes."""
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if not alert:
            return None
        alert.resolution_notes = notes
        alert.status = "resolved"
        alert.resolved_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(alert)
        return alert
    except Exception:
        db.rollback()
        return None


def set_alert_sla_breach(db: Session, alert_id: int, breached: bool = True) -> Optional[Alert]:
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if not alert:
            return None
        alert.sla_breached = bool(breached)
        db.commit()
        db.refresh(alert)
        return alert
    except Exception:
        db.rollback()
        return None


def list_alerts(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    severity: Optional[str] = None,
) -> List[Alert]:
    """Return recent alerts ordered by newest first."""
    try:
        query = db.query(Alert)
        if status:
            query = query.filter(Alert.status == status)
        if severity:
            query = query.filter(Alert.severity == severity)
        return query.order_by(Alert.created_at.desc()).offset(skip).limit(limit).all()
    except Exception:
        db.rollback()
        return []


def get_alert_by_id(db: Session, alert_id: int) -> Optional[Alert]:
    """Return a single alert by id or None if not found."""
    try:
        return db.query(Alert).filter(Alert.id == alert_id).first()
    except Exception:
        db.rollback()
        return None
