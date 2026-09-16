from typing import Optional
from sqlalchemy.orm import Session

try:
    from backend.app.repositories.alert_repository import create_alert as repo_create_alert
except Exception:
    from ..repositories.alert_repository import create_alert as repo_create_alert
try:
    from backend.app.repositories.alert_repository import assign_alert as repo_assign_alert
    from backend.app.repositories.alert_repository import resolve_alert as repo_resolve_alert
    from backend.app.repositories.alert_repository import set_alert_sla_breach as repo_set_alert_sla_breach
except Exception:
    from ..repositories.alert_repository import assign_alert as repo_assign_alert
    from ..repositories.alert_repository import resolve_alert as repo_resolve_alert
    from ..repositories.alert_repository import set_alert_sla_breach as repo_set_alert_sla_breach
import json
try:
    from backend.app.services.websocket_service import broadcast_sync as ws_broadcast_sync
except Exception:
    from .websocket_service import broadcast_sync as ws_broadcast_sync
try:
    from backend.app.services.audit_service import log_action as svc_log_action
except Exception:
    from .audit_service import log_action as svc_log_action


def create_alert(db: Session, meter_id: Optional[int], reading_id: Optional[int], type: str, score: Optional[float], explanation: Optional[str]):
    # Map anomaly/alert types to severity if caller doesn't provide one
    type_to_severity = {
        "high_power_spike": "high",
        "high_power_absolute": "high",
        "abnormal_night_usage": "medium",
        "tamper_suspicion": "high",
        "tamper": "high",
    }
    severity = type_to_severity.get(type, "medium")

    alert = repo_create_alert(db, meter_id=meter_id, reading_id=reading_id, type=type, score=score, explanation=explanation, severity=severity)
    # Prepare a JSON-serializable representation of the alert
    try:
        alert_data = {
            "id": alert.id,
            "meter_id": alert.meter_id,
            "reading_id": alert.reading_id,
            "type": alert.type,
            "score": alert.score,
            "explanation": alert.explanation,
            "created_at": alert.created_at.isoformat() if getattr(alert, "created_at", None) is not None else None,
            "updated_at": alert.updated_at.isoformat() if getattr(alert, "updated_at", None) is not None else None,
        }
    except Exception:
        # Fallback: shallow dict using attributes (best-effort)
        try:
            alert_data = {k: getattr(alert, k, None) for k in ("id", "meter_id", "reading_id", "type", "score", "explanation", "created_at", "updated_at")}
        except Exception:
            alert_data = {}

    # Broadcast alert to connected websocket clients (best-effort)
    try:
        # attach a lightweight decision to the broadcast so clients can surface suggested actions
        try:
            from backend.app.services.decision_service import generate_decision
        except Exception:
            from .decision_service import generate_decision

        try:
            decision = generate_decision(alert)
            alert_data["decision"] = decision
        except Exception:
            alert_data["decision"] = None

        ws_broadcast_sync(json.dumps({"type": "alert", "data": alert_data}))
    except Exception:
        pass

    return alert


def assign_alert(db: Session, alert_id: int, user_id: int, actor_user_id: Optional[int] = None):
    """Assign an alert to a user (delegates to repository)."""
    try:
        alert = repo_assign_alert(db, alert_id=alert_id, user_id=user_id)
    except Exception:
        return None

    # Audit log: alert assigned
    try:
        svc_log_action(
            db,
            actor_user_id if actor_user_id is not None else user_id,
            "alert_assigned",
            entity="alert",
            entity_id=alert_id,
            metadata={"assigned_to": user_id},
        )
    except Exception:
        pass

    # SLA check: compare response_time against SLA per severity
    try:
        # SLA definitions in minutes for response
        SLA_RESPONSE_MINUTES = {
            "critical": 15,
            "high": 30,
            "medium": 60,
            "low": 240,
        }
        if alert is not None and getattr(alert, "responded_at", None) is not None:
            created = getattr(alert, "created_at", None)
            responded = getattr(alert, "responded_at", None)
            if created and responded:
                delta = (responded - created).total_seconds()
                sev = getattr(alert, "severity", "medium") or "medium"
                sla_secs = float(SLA_RESPONSE_MINUTES.get(sev, 60) * 60)
                if delta > sla_secs:
                    try:
                        repo_set_alert_sla_breach(db, alert.id, breached=True)
                        alert.sla_breached = True
                    except Exception:
                        pass
    except Exception:
        pass

    return alert


def resolve_alert(db: Session, alert_id: int, notes: Optional[str], actor_user_id: Optional[int] = None):
    """Resolve an alert with optional resolution notes (delegates to repository)."""
    try:
        alert = repo_resolve_alert(db, alert_id=alert_id, notes=notes)
    except Exception:
        return None

    # Audit log: alert resolved (use assigned_to if available)
    try:
        user_id = actor_user_id if actor_user_id is not None else getattr(alert, "assigned_to", None)
        svc_log_action(db, user_id, "alert_resolved", entity="alert", entity_id=alert_id)
    except Exception:
        pass

    # SLA resolution check: compare resolution_time against SLA per severity
    try:
        # SLA definitions in hours for resolution
        SLA_RESOLUTION_HOURS = {
            "critical": 2,
            "high": 6,
            "medium": 24,
            "low": 72,
        }
        if alert is not None and getattr(alert, "resolved_at", None) is not None:
            created = getattr(alert, "created_at", None)
            resolved = getattr(alert, "resolved_at", None)
            if created and resolved:
                delta = (resolved - created).total_seconds()
                sev = getattr(alert, "severity", "medium") or "medium"
                sla_secs = float(SLA_RESOLUTION_HOURS.get(sev, 24) * 3600)
                if delta > sla_secs:
                    try:
                        repo_set_alert_sla_breach(db, alert.id, breached=True)
                        alert.sla_breached = True
                    except Exception:
                        pass
    except Exception:
        pass

    return alert
