"""Role provisioning and safe user-role backfill helpers."""

from typing import Dict

from sqlalchemy.orm import Session

try:
    from backend.app.models.user import User
    from backend.app.repositories.role_repository import get_or_create_role
except Exception:
    from ..models.user import User
    from ..repositories.role_repository import get_or_create_role


DEFAULT_ROLE_NAMES = ("admin", "operator", "inspector", "viewer")

DEMO_ROLE_BY_EMAIL = {
    "admin@example.com": "admin",
    "alice@example.com": "inspector",
    "bob@example.com": "inspector",
    "carol@example.com": "operator",
}


def ensure_default_roles(db: Session) -> Dict[str, object]:
    return {name: get_or_create_role(db, name) for name in DEFAULT_ROLE_NAMES}


def backfill_null_roles(db: Session) -> int:
    roles = ensure_default_roles(db)
    updated = (
        db.query(User)
        .filter(User.role_id.is_(None))
        .update({User.role_id: roles["viewer"].id}, synchronize_session=False)
    )
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return int(updated or 0)
