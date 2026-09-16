from typing import List, Any, Optional
import json
import logging
import re
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

try:
    from backend.app.core.database import get_db
    from backend.app.services.alert_service import assign_alert as svc_assign_alert, resolve_alert as svc_resolve_alert
    from backend.app.dependencies.auth import get_current_user, require_roles
    from backend.app.models.processed_action import ProcessedAction
    from backend.app.repositories.user_repository import get_user_by_id
except Exception:
    from ...core.database import get_db
    from ...services.alert_service import assign_alert as svc_assign_alert, resolve_alert as svc_resolve_alert
    from ...dependencies.auth import get_current_user, require_roles
    from ...models.processed_action import ProcessedAction
    from ...repositories.user_repository import get_user_by_id

router = APIRouter(prefix="/sync", tags=["sync"])
logger = logging.getLogger("helios.sync")


class SyncItem(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    method: str = Field(..., min_length=3, max_length=8)
    url: str = Field(..., min_length=1, max_length=255)
    data: Optional[dict] = None
    ts: Optional[str] = None


class SyncRequest(BaseModel):
    # `max_length` is a string constraint and is rejected by Pydantic for
    # list fields. `max_items` preserves the intended batch-size limit.
    actions: List[SyncItem] = Field(default_factory=list, max_items=100)


@router.post("/actions")
def sync_actions(payload: SyncRequest, db: Session = Depends(get_db), current_user: Any = Depends(require_roles("admin", "administrator", "operator"))):
    """Apply a batch of offline actions sent from clients. Returns applied ids."""
    results = []
    applied_ids: List[str] = []

    for act in payload.actions:
        res = {"id": act.id, "status": "skipped", "error": None}
        reservation = None
        try:
            path = re.sub(r"^/api/v1(?=/|$)", "", act.url or "")
            path = path.split("?", 1)[0]
            method = act.method.upper()

            # The action id is the idempotency key. Reserve it before applying
            # the mutation so a retry cannot double-assign or double-resolve.
            existing = db.query(ProcessedAction).filter(ProcessedAction.action_id == act.id).first()
            if existing is not None:
                if existing.user_id != getattr(current_user, "id", None):
                    res["status"] = "error"
                    res["error"] = "action id already belongs to another user"
                else:
                    res["status"] = "ok" if existing.status == "applied" else existing.status
                    try:
                        res["result"] = json.loads(existing.result_json) if existing.result_json else None
                    except Exception:
                        res["result"] = None
                    if res["status"] == "ok":
                        applied_ids.append(act.id)
                results.append(res)
                continue

            reservation = ProcessedAction(
                action_id=act.id,
                user_id=getattr(current_user, "id", None),
                method=method,
                url=path,
                status="processing",
            )
            db.add(reservation)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                existing = db.query(ProcessedAction).filter(ProcessedAction.action_id == act.id).first()
                if existing is not None and existing.user_id == getattr(current_user, "id", None):
                    res["status"] = "ok" if existing.status == "applied" else existing.status
                    applied_ids.append(act.id) if res["status"] == "ok" else None
                else:
                    res["status"] = "error"
                    res["error"] = "action id already belongs to another user"
                results.append(res)
                continue

            m = re.match(r"^/alerts/(\d+)/assign/?$", path)
            if m and method == 'POST':
                alert_id = int(m.group(1))
                user_id = (act.data or {}).get('user_id')
                if user_id is None:
                    raise ValueError('missing user_id')
                assignee = get_user_by_id(db, int(user_id))
                if assignee is None or not getattr(assignee, "is_active", False):
                    raise ValueError('assignee is not active')
                out = svc_assign_alert(
                    db,
                    alert_id=alert_id,
                    user_id=int(user_id),
                    actor_user_id=getattr(current_user, "id", None),
                )
                if out is None:
                    raise Exception('assign failed')
                res['status'] = 'ok'
                res['result'] = {'id': getattr(out, 'id', None)}
            else:
                m = re.match(r"^/alerts/(\d+)/resolve/?$", path)
                if m and method in ('PATCH', 'PUT'):
                    alert_id = int(m.group(1))
                    notes = (act.data or {}).get('notes')
                    out = svc_resolve_alert(
                        db,
                        alert_id=alert_id,
                        notes=notes,
                        actor_user_id=getattr(current_user, "id", None),
                    )
                    if out is None:
                        raise Exception('resolve failed')
                    res['status'] = 'ok'
                    res['result'] = {'id': getattr(out, 'id', None)}
                else:
                    res['status'] = 'unsupported'

            reservation.status = 'applied' if res['status'] == 'ok' else 'unsupported'
            reservation.result_json = json.dumps(res.get('result'))
            db.commit()
            if res['status'] == 'ok':
                applied_ids.append(act.id)
            results.append(res)
        except Exception as exc:
            db.rollback()
            if reservation is not None:
                try:
                    stale = db.query(ProcessedAction).filter(ProcessedAction.action_id == act.id).first()
                    if stale is not None and stale.status == "processing":
                        db.delete(stale)
                        db.commit()
                except Exception:
                    db.rollback()
            logger.warning("offline action failed", extra={"action_id": act.id, "error": str(exc)})
            res['status'] = 'error'
            res['error'] = 'action failed'
            results.append(res)

    return {"applied": applied_ids, "results": results}
