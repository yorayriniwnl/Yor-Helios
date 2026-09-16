import json
from typing import List, Optional, Any, Dict
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, conint

try:
    from backend.app.repositories.alert_repository import list_alerts as repo_list_alerts
    from backend.app.schemas.alert import AlertResponse, AlertInvestigationResponse
    from backend.app.core.database import get_db
    from backend.app.services.alert_service import assign_alert as svc_assign_alert, resolve_alert as svc_resolve_alert
    from backend.app.schemas.alert import PriorityAlertResponse
    from backend.app.services.priority_service import get_prioritized_alerts as svc_get_prioritized_alerts
    from backend.app.dependencies.auth import get_current_user, require_roles
    from backend.app.services.evidence_service import save_file_and_create_record as svc_save_evidence
    from backend.app.repositories.evidence_repository import list_evidence_by_alert as repo_list_evidence
    from backend.app.repositories.alert_repository import get_alert_by_id as repo_get_alert_by_id
    from backend.app.repositories.user_repository import get_user_by_id as repo_get_user_by_id
    from backend.app.models.alert import Alert
    from backend.app.models.anomaly_event import AnomalyEvent
    from backend.app.models.audit_log import AuditLog
    from backend.app.models.meter import Meter
    from backend.app.models.reading import Reading
    from backend.app.models.zone import Zone
    from fastapi.responses import FileResponse
except Exception:
    from ...repositories.alert_repository import list_alerts as repo_list_alerts
    from ...schemas.alert import AlertResponse, AlertInvestigationResponse
    from ...core.database import get_db
    from ...services.alert_service import assign_alert as svc_assign_alert, resolve_alert as svc_resolve_alert
    from ...schemas.alert import PriorityAlertResponse
    from ...services.priority_service import get_prioritized_alerts as svc_get_prioritized_alerts
    from ...dependencies.auth import get_current_user, require_roles
    from ...services.evidence_service import save_file_and_create_record as svc_save_evidence
    from ...repositories.evidence_repository import list_evidence_by_alert as repo_list_evidence
    from ...repositories.alert_repository import get_alert_by_id as repo_get_alert_by_id
    from ...repositories.user_repository import get_user_by_id as repo_get_user_by_id
    from ...models.alert import Alert
    from ...models.anomaly_event import AnomalyEvent
    from ...models.audit_log import AuditLog
    from ...models.meter import Meter
    from ...models.reading import Reading
    from ...models.zone import Zone
    from fastapi.responses import FileResponse


router = APIRouter(prefix="/alerts", tags=["alerts"])


_EVIDENCE_TYPE_BY_SUFFIX = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
}


def _validate_evidence_upload(content_type: str, filename: Optional[str], contents: bytes) -> None:
    """Reject extension/MIME-spoofed evidence before it reaches storage."""
    normalized_type = (content_type or "").lower().strip()
    suffix = Path(filename or "").suffix.lower()
    expected_type = _EVIDENCE_TYPE_BY_SUFFIX.get(suffix)
    if expected_type is None or normalized_type != expected_type:
        raise HTTPException(status_code=415, detail="Only matching JPEG, PNG, WebP, and PDF evidence is supported")

    signatures_match = {
        "image/jpeg": contents.startswith(b"\xff\xd8\xff"),
        "image/png": contents.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": len(contents) >= 12 and contents[:4] == b"RIFF" and contents[8:12] == b"WEBP",
        "application/pdf": contents.startswith(b"%PDF-"),
    }
    if not signatures_match.get(normalized_type, False):
        raise HTTPException(status_code=415, detail="Evidence content does not match its declared file type")


@router.get("/", response_model=List[AlertResponse])
def list_alerts_route(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None, min_length=1, max_length=50),
    severity: Optional[str] = Query(None, min_length=1, max_length=50),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    """Return recent alerts (newest first)."""
    try:
        from backend.app.services.decision_service import generate_decision
    except Exception:
        from ...services.decision_service import generate_decision

    rows = repo_list_alerts(db, skip=skip, limit=limit, status=status, severity=severity)
    out = []
    for r in rows:
        try:
            item = {
                "id": getattr(r, 'id', None),
                "meter_id": getattr(r, 'meter_id', None),
                "reading_id": getattr(r, 'reading_id', None),
                "type": getattr(r, 'type', None),
                "score": getattr(r, 'score', None),
                "explanation": getattr(r, 'explanation', None),
                "assigned_to": getattr(r, 'assigned_to', None),
                "status": getattr(r, 'status', None),
                "severity": getattr(r, 'severity', None),
                "responded_at": getattr(r, 'responded_at', None),
                "resolved_at": getattr(r, 'resolved_at', None),
                "sla_breached": getattr(r, 'sla_breached', None),
                "created_at": getattr(r, 'created_at', None),
            }
        except Exception:
            item = {k: getattr(r, k, None) for k in ("id", "meter_id", "reading_id", "type", "score", "explanation", "assigned_to", "status", "severity", "created_at")}

        try:
            item["decision"] = generate_decision(r)
        except Exception:
            item["decision"] = None

        out.append(item)

    return out


class AssignRequest(BaseModel):
    user_id: conint(gt=0)


class ResolveRequest(BaseModel):
    notes: Optional[str] = Field(None, max_length=2000)


@router.post("/{alert_id}/assign", response_model=AlertResponse)
def assign_alert_route(alert_id: int, payload: AssignRequest, db: Session = Depends(get_db), current_user: Any = Depends(require_roles("admin", "administrator", "operator", "inspector"))):
    existing = repo_get_alert_by_id(db, alert_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    if getattr(existing, "status", "") == "resolved":
        raise HTTPException(status_code=409, detail="Resolved alerts cannot be reassigned")
    assignee = repo_get_user_by_id(db, payload.user_id)
    if assignee is None or not getattr(assignee, "is_active", False):
        raise HTTPException(status_code=400, detail="Assignee is not an active user")
    try:
        res = svc_assign_alert(
            db,
            alert_id=alert_id,
            user_id=payload.user_id,
            actor_user_id=getattr(current_user, "id", None),
        )
    except Exception:
        res = None
    if res is None:
        raise HTTPException(status_code=500, detail="Failed to assign alert")
    return res


@router.patch("/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert_route(alert_id: int, payload: ResolveRequest, db: Session = Depends(get_db), current_user: Any = Depends(require_roles("admin", "administrator", "operator", "inspector"))):
    existing = repo_get_alert_by_id(db, alert_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    if getattr(existing, "status", "") == "resolved":
        raise HTTPException(status_code=409, detail="Alert is already resolved")
    try:
        res = svc_resolve_alert(
            db,
            alert_id=alert_id,
            notes=payload.notes,
            actor_user_id=getattr(current_user, "id", None),
        )
    except Exception:
        res = None
    if res is None:
        raise HTTPException(status_code=500, detail="Failed to resolve alert")
    return res



@router.get("/priority", response_model=List[PriorityAlertResponse])
def list_priority_alerts_route(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    window_hours: int = Query(24, ge=1, le=168),
    high_risk_threshold: int = Query(5, ge=1, le=100000),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    try:
        results = svc_get_prioritized_alerts(db, skip=skip, limit=limit, window_hours=window_hours, high_risk_threshold=high_risk_threshold)
        return results
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to compute prioritized alerts")


def _score_band(alert: Any) -> str:
    severity = str(getattr(alert, "severity", "") or "").lower()
    if severity in {"critical", "high"}:
        return "HIGH"
    if severity == "medium":
        return "MEDIUM"
    try:
        score = float(getattr(alert, "score", 0.0) or 0.0)
    except (TypeError, ValueError):
        score = 0.0
    if score >= 0.66:
        return "HIGH"
    if score >= 0.33:
        return "MEDIUM"
    return "LOW"


def _possible_causes(alert_type: str) -> List[str]:
    normalized = (alert_type or "unknown").lower()
    if "tamper" in normalized or "under" in normalized:
        return [
            "Meter interference, bypass, or an installation fault",
            "Telemetry/reporting fault causing under-reporting",
        ]
    if "voltage" in normalized:
        return [
            "Upstream voltage instability or transformer stress",
            "Local wiring, connection, or meter-sensor fault",
        ]
    if "power" in normalized or "spike" in normalized:
        return [
            "A real load change or a newly connected device",
            "Meter wiring or sensing fault",
        ]
    if "disconnect" in normalized:
        return [
            "Intermittent connectivity or power quality interruption",
            "Meter hardware, antenna, or installation fault",
        ]
    if "night" in normalized:
        return [
            "Unexpected scheduled or overnight load",
            "Metering or time-series interpretation fault",
        ]
    return [
        "The stored alert type requires field verification",
        "No single cause is established by this signal alone",
    ]


def _recommended_response(alert_type: str, status: str) -> str:
    if status == "resolved":
        return "Review the resolution note and retain the evidence chain for audit."
    normalized = (alert_type or "unknown").lower()
    if "tamper" in normalized or "under" in normalized:
        return "Assign an inspector, compare the meter with the upstream path, and attach before/after evidence."
    if "voltage" in normalized:
        return "Check the feeder and transformer path, then verify the local meter connection before closing."
    if "disconnect" in normalized:
        return "Check telemetry connectivity and installation power; confirm a stable reading before closing."
    return "Inspect the linked reading and meter context, then record the field outcome before resolving."


def _signal_summary(reading: Any) -> List[str]:
    if reading is None:
        return []
    labels = (
        ("Power", "power_consumption", "W"),
        ("Voltage", "voltage", "V"),
        ("Current", "current", "A"),
    )
    result: List[str] = []
    for label, field, unit in labels:
        value = getattr(reading, field, None)
        if value is not None:
            result.append(f"{label} {float(value):.2f} {unit}")
    result.append(f"Observed at {reading.timestamp.isoformat()}")
    return result


def _audit_detail(action: str, metadata_json: Optional[str]) -> str:
    detail = action.replace("_", " ").strip().capitalize()
    if metadata_json:
        try:
            metadata = json.loads(metadata_json)
            if isinstance(metadata, dict) and metadata:
                rendered = ", ".join(f"{key}={value}" for key, value in sorted(metadata.items()))
                detail = f"{detail} ({rendered})"
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    return detail


@router.get("/{alert_id}", response_model=AlertInvestigationResponse)
def get_alert_investigation_route(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    """Return the bounded context needed to investigate one alert."""
    alert = repo_get_alert_by_id(db, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    meter = db.query(Meter).filter(Meter.id == alert.meter_id).first() if alert.meter_id else None
    zone = db.query(Zone).filter(Zone.id == meter.zone_id).first() if meter and meter.zone_id else None
    reading = db.query(Reading).filter(Reading.id == alert.reading_id).first() if alert.reading_id else None
    anomalies = (
        db.query(AnomalyEvent)
        .filter(
            (AnomalyEvent.reading_id == alert.reading_id)
            if alert.reading_id
            else (AnomalyEvent.meter_id == alert.meter_id)
        )
        .order_by(AnomalyEvent.created_at.desc())
        .limit(50)
        .all()
        if alert.reading_id or alert.meter_id
        else []
    )

    evidence_rows = repo_list_evidence(db, alert_id=alert_id, limit=50)
    evidence = [
        {
            "id": row.id,
            "alert_id": row.alert_id,
            "original_filename": row.original_filename,
            "file_url": f"/api/v1/alerts/evidence/{row.id}/file",
            "gps_lat": row.gps_lat,
            "gps_lon": row.gps_lon,
            "evidence_ts": row.evidence_ts,
            "notes": row.notes,
            "before_after": row.before_after,
            "created_at": row.created_at,
        }
        for row in evidence_rows
    ]

    timeline: List[Dict[str, Any]] = [
        {
            "event": "detected",
            "at": alert.created_at,
            "actor_id": None,
            "detail": "Alert created by the detection pipeline",
            "source": "detection_pipeline",
        }
    ]
    if alert.responded_at:
        timeline.append({
            "event": "assigned",
            "at": alert.responded_at,
            "actor_id": alert.assigned_to,
            "detail": "Alert assigned for field investigation",
            "source": "alert_state",
        })
    if alert.resolved_at:
        timeline.append({
            "event": "resolved",
            "at": alert.resolved_at,
            "actor_id": alert.assigned_to,
            "detail": alert.resolution_notes or "Alert marked resolved",
            "source": "alert_state",
        })
    try:
        audit_rows = (
            db.query(AuditLog)
            .filter(AuditLog.entity == "alert", AuditLog.entity_id == alert_id)
            .order_by(AuditLog.timestamp.asc())
            .limit(100)
            .all()
        )
        timeline.extend(
            {
                "event": row.action,
                "at": row.timestamp,
                "actor_id": row.user_id,
                "detail": _audit_detail(row.action, row.metadata_json),
                "source": "audit_log",
            }
            for row in audit_rows
        )
    except Exception:
        db.rollback()
    timeline.sort(key=lambda item: (item["at"], item["event"], item["source"]))

    try:
        from backend.app.services.decision_service import generate_decision
    except Exception:
        from ...services.decision_service import generate_decision
    try:
        decision = generate_decision(alert)
    except Exception:
        decision = None

    alert_data = {
        "id": alert.id,
        "meter_id": alert.meter_id,
        "reading_id": alert.reading_id,
        "type": alert.type,
        "score": alert.score,
        "explanation": alert.explanation,
        "assigned_to": alert.assigned_to,
        "status": alert.status,
        "severity": alert.severity,
        "responded_at": alert.responded_at,
        "resolved_at": alert.resolved_at,
        "resolution_notes": alert.resolution_notes,
        "sla_breached": alert.sla_breached,
        "created_at": alert.created_at,
        "decision": decision,
    }
    uncertainty = ["The detector score is an anomaly score, not a calibrated probability."]
    if reading is None:
        uncertainty.append("No telemetry reading is linked to this alert.")
    if not anomalies:
        uncertainty.append("No related anomaly event is stored for this alert.")

    return {
        "alert": alert_data,
        "meter": meter,
        "zone": zone,
        "reading": reading,
        "anomalies": anomalies,
        "evidence": evidence,
        "timeline": timeline,
        "investigation": {
            "detector": "rule_baseline_with_optional_ml",
            "score_band": _score_band(alert),
            "score_is_probability": False,
            "evidence_state": "MEASURED_READING" if reading is not None else "NO_LINKED_READING",
            "observed_signals": _signal_summary(reading),
            "possible_causes": _possible_causes(alert.type),
            "uncertainty": uncertainty,
            "recommended_response": _recommended_response(alert.type, alert.status),
        },
    }



@router.post("/{alert_id}/evidence")
async def upload_evidence_route(alert_id: int, file: UploadFile = File(...), gps_lat: Optional[float] = Form(None), gps_lon: Optional[float] = Form(None), evidence_ts: Optional[str] = Form(None), notes: Optional[str] = Form(None), before_after: Optional[str] = Form(None), db: Session = Depends(get_db), current_user: Any = Depends(require_roles("admin", "administrator", "operator", "inspector"))):
    if repo_get_alert_by_id(db, alert_id) is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    max_bytes = 10 * 1024 * 1024
    try:
        contents = await file.read(max_bytes + 1)
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to read uploaded file")
    if len(contents) > max_bytes:
        raise HTTPException(status_code=413, detail="Evidence file must be 10 MB or smaller")
    _validate_evidence_upload(file.content_type or "", file.filename, contents)

    try:
        rec = svc_save_evidence(db, alert_id=alert_id, file_bytes=contents, filename=file.filename or 'upload', user_id=getattr(current_user, 'id', None), gps_lat=gps_lat, gps_lon=gps_lon, evidence_ts=evidence_ts, notes=notes, before_after=before_after)
        return {
            "id": getattr(rec, 'id', None),
            "alert_id": getattr(rec, 'alert_id', None),
            "file_url": f"/api/v1/alerts/evidence/{getattr(rec, 'id', None)}/file",
            "original_filename": getattr(rec, 'original_filename', None),
            "gps_lat": getattr(rec, 'gps_lat', None),
            "gps_lon": getattr(rec, 'gps_lon', None),
            "evidence_ts": getattr(rec, 'evidence_ts', None),
            "notes": getattr(rec, 'notes', None),
            "before_after": getattr(rec, 'before_after', None),
            "created_at": getattr(rec, 'created_at', None),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to save evidence")



@router.get("/{alert_id}/evidence")
def list_evidence_route(alert_id: int, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    if repo_get_alert_by_id(db, alert_id) is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    try:
        rows = repo_list_evidence(db, alert_id=alert_id)
        out = []
        for r in rows:
            out.append({
                "id": getattr(r, 'id', None),
                "alert_id": getattr(r, 'alert_id', None),
                "original_filename": getattr(r, 'original_filename', None),
                "file_url": f"/api/v1/alerts/evidence/{getattr(r,'id',None)}/file",
                "gps_lat": getattr(r, 'gps_lat', None),
                "gps_lon": getattr(r, 'gps_lon', None),
                "evidence_ts": getattr(r, 'evidence_ts', None),
                "notes": getattr(r, 'notes', None),
                "before_after": getattr(r, 'before_after', None),
                "created_at": getattr(r, 'created_at', None),
            })
        return out
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to list evidence")


@router.get("/evidence/{evidence_id}/file")
def get_evidence_file(evidence_id: int, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    try:
        from backend.app.repositories.evidence_repository import get_evidence_by_id
        rec = get_evidence_by_id(db, evidence_id)
        if rec is None:
            raise HTTPException(status_code=404, detail="Not found")
        path = getattr(rec, 'file_path', None)
        if not path:
            raise HTTPException(status_code=404, detail="File not found")
        try:
            from backend.app.services.evidence_service import STORAGE_DIR
        except Exception:
            from ...services.evidence_service import STORAGE_DIR
        storage_root = Path(STORAGE_DIR).resolve()
        resolved_path = Path(path).resolve()
        if storage_root not in resolved_path.parents or not resolved_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(
            str(resolved_path),
            filename=Path(getattr(rec, 'original_filename', None) or 'evidence').name,
            headers={"Cache-Control": "private, no-store"},
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to serve evidence file")
