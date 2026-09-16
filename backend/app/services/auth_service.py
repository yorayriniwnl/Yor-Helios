from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

try:
    from backend.app.repositories.auth_session_repository import (
        create_session,
        get_session_by_refresh_hash,
        revoke_session,
    )
    from backend.app.repositories.user_repository import get_user_by_email, get_user_by_id
    from backend.app.core.security import (
        REFRESH_TOKEN_EXPIRE_DAYS,
        create_access_token,
        create_refresh_token,
        hash_refresh_token,
        verify_password,
    )
except Exception:
    from ..repositories.auth_session_repository import (
        create_session,
        get_session_by_refresh_hash,
        revoke_session,
    )
    from ..repositories.user_repository import get_user_by_email, get_user_by_id
    from ..core.security import (
        REFRESH_TOKEN_EXPIRE_DAYS,
        create_access_token,
        create_refresh_token,
        hash_refresh_token,
        verify_password,
    )
try:
    from backend.app.services.audit_service import log_action as svc_log_action
except Exception:
    from ..services.audit_service import log_action as svc_log_action


def _authenticate_user(db: Session, email: str, password: str):
    user = get_user_by_email(db, email)
    if not user or not getattr(user, "is_active", False):
        raise ValueError("Invalid credentials")
    if not verify_password(password, user.password_hash):
        raise ValueError("Invalid credentials")
    return user


def _audit_login(db: Session, user_id: int, action: str = "user_login") -> None:
    # Best-effort audit log for successful login
    try:
        svc_log_action(db, user_id, action, entity="user")
    except Exception:
        pass


def login(db: Session, email: str, password: str) -> str:
    """Authenticate user and return a legacy access token."""
    user = _authenticate_user(db, email, password)
    token = create_access_token(user.id)
    _audit_login(db, user.id)
    return token


def _token_bundle(access_token: str, refresh_token: str) -> dict:
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 15 * 60,
    }


def login_with_session(db: Session, email: str, password: str) -> dict:
    """Authenticate a user and create a revocable refresh session."""
    user = _authenticate_user(db, email, password)
    refresh_token, refresh_hash = create_refresh_token()
    session_id = uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    create_session(db, user.id, session_id, refresh_hash, expires_at)
    access_token = create_access_token(user.id, session_id=session_id)
    _audit_login(db, user.id)
    return _token_bundle(access_token, refresh_token)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def refresh_session(db: Session, refresh_token: str) -> dict:
    """Rotate a valid refresh session and return a new token bundle."""
    if not refresh_token or len(refresh_token) > 512:
        raise ValueError("Invalid refresh token")

    session = get_session_by_refresh_hash(db, hash_refresh_token(refresh_token))
    now = datetime.now(timezone.utc)
    if session is None or session.revoked_at is not None or _utc(session.expires_at) <= now:
        raise ValueError("Invalid refresh token")

    user = get_user_by_id(db, session.user_id)
    if user is None or not getattr(user, "is_active", False):
        raise ValueError("Invalid refresh token")

    next_refresh_token, next_refresh_hash = create_refresh_token()
    next_session_id = uuid4().hex
    next_expires_at = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    revoke_session(db, session, replaced_by=next_session_id)
    create_session(db, user.id, next_session_id, next_refresh_hash, next_expires_at)
    access_token = create_access_token(user.id, session_id=next_session_id)
    _audit_login(db, user.id, action="user_token_refresh")
    return _token_bundle(access_token, next_refresh_token)


def revoke_session_for_refresh_token(
    db: Session,
    refresh_token: str,
    expected_session_id: str | None = None,
) -> None:
    """Revoke a matching session without exposing token existence."""
    if not refresh_token or len(refresh_token) > 512:
        return
    session = get_session_by_refresh_hash(db, hash_refresh_token(refresh_token))
    if expected_session_id is not None and (session is None or session.session_id != expected_session_id):
        raise ValueError("Invalid refresh token")
    if session is not None and session.revoked_at is None:
        revoke_session(db, session)
