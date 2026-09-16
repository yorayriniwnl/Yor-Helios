"""Persistence helpers for named user roles."""

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

try:
    from backend.app.models.role import Role
except Exception:
    from ..models.role import Role


def get_role_by_name(db: Session, name: str) -> Optional[Role]:
    normalized = (name or "").strip().lower()
    if not normalized:
        return None
    return db.query(Role).filter(func.lower(Role.name) == normalized).first()


def get_or_create_role(db: Session, name: str) -> Role:
    role = get_role_by_name(db, name)
    if role is not None:
        return role
    role = Role(name=name.strip().lower())
    db.add(role)
    try:
        db.commit()
        db.refresh(role)
    except Exception:
        db.rollback()
        existing = get_role_by_name(db, name)
        if existing is not None:
            return existing
        raise
    return role
