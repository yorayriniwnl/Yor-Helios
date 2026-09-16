from typing import Optional, List
from sqlalchemy.orm import Session

try:
    from backend.app.models.evidence import Evidence
except Exception:
    from ..models.evidence import Evidence


def create_evidence(db: Session, alert_id: int, user_id: Optional[int], file_path: str, original_filename: Optional[str], gps_lat: Optional[float], gps_lon: Optional[float], evidence_ts: Optional[str], notes: Optional[str], before_after: Optional[str]) -> Evidence:
    ev = Evidence(
        alert_id=alert_id,
        user_id=user_id,
        file_path=file_path,
        original_filename=original_filename,
        gps_lat=gps_lat,
        gps_lon=gps_lon,
        evidence_ts=evidence_ts,
        notes=notes,
        before_after=before_after,
    )
    db.add(ev)
    try:
        db.commit()
        db.refresh(ev)
    except Exception:
        db.rollback()
        raise
    return ev


def list_evidence_by_alert(db: Session, alert_id: int, skip: int = 0, limit: int = 100) -> List[Evidence]:
    try:
        return db.query(Evidence).filter(Evidence.alert_id == alert_id).order_by(Evidence.created_at.desc()).offset(skip).limit(limit).all()
    except Exception:
        db.rollback()
        return []


def get_evidence_by_id(db: Session, evidence_id: int) -> Optional[Evidence]:
    try:
        return db.query(Evidence).filter(Evidence.id == evidence_id).first()
    except Exception:
        db.rollback()
        return None
