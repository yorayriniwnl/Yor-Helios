"""Persistence helpers for refresh-token sessions."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

try:
    from backend.app.models.auth_session import AuthSession
except Exception:
    from ..models.auth_session import AuthSession


def create_session(
    db: Session,
    user_id: int,
    session_id: str,
    refresh_token_hash: str,
    expires_at: datetime,
) -> AuthSession:
    session = AuthSession(
        user_id=user_id,
        session_id=session_id,
        refresh_token_hash=refresh_token_hash,
        expires_at=expires_at,
    )
    db.add(session)
    try:
        db.commit()
        db.refresh(session)
    except Exception:
        db.rollback()
        raise
    return session


def get_session_by_id(db: Session, session_id: str) -> Optional[AuthSession]:
    return db.query(AuthSession).filter(AuthSession.session_id == session_id).first()


def get_session_by_refresh_hash(db: Session, refresh_token_hash: str) -> Optional[AuthSession]:
    return db.query(AuthSession).filter(AuthSession.refresh_token_hash == refresh_token_hash).first()


def revoke_session(
    db: Session,
    session: AuthSession,
    replaced_by: Optional[str] = None,
) -> AuthSession:
    if session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
    if replaced_by is not None:
        session.replaced_by = replaced_by
    session.last_used_at = datetime.now(timezone.utc)
    try:
        db.commit()
        db.refresh(session)
    except Exception:
        db.rollback()
        raise
    return session
