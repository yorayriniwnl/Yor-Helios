from typing import Optional
from sqlalchemy.orm import Session
import json

try:
    from backend.app.models.audit_log import AuditLog
except Exception:
    from ..models.audit_log import AuditLog


def create_audit_log(
    db: Session,
    user_id: Optional[int],
    action: str,
    entity: str,
    entity_id: Optional[int] = None,
    metadata: Optional[dict] = None,
) -> AuditLog:
    """Create and persist an AuditLog record.

    Metadata (if provided) will be JSON-serialized into a string for storage.
    """
    meta_str = None
    try:
        if metadata is not None:
            meta_str = json.dumps(metadata)
    except Exception:
        # best-effort: fall back to string representation
        try:
            meta_str = str(metadata)
        except Exception:
            meta_str = None

    audit = AuditLog(user_id=user_id, action=action, entity=entity, entity_id=entity_id, metadata_json=meta_str)
    db.add(audit)
    try:
        db.commit()
        db.refresh(audit)
    except Exception:
        db.rollback()
        raise
    return audit
