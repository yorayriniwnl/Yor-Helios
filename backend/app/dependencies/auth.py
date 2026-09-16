from datetime import datetime, timezone
from typing import Any, Callable
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

try:
    from backend.app.core.security import decode_token
    from backend.app.core.database import get_db
    from backend.app.repositories.auth_session_repository import get_session_by_id
    from backend.app.repositories.user_repository import get_user_by_id
except Exception:
    from ..core.security import decode_token
    from ..core.database import get_db
    from ..repositories.auth_session_repository import get_session_by_id
    from ..repositories.user_repository import get_user_by_id


_bearer = HTTPBearer(auto_error=False)


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)) -> Any:
    """Validate bearer token and return the authenticated user.

    Raises HTTPException(401) when token is missing/invalid or user not found.
    """
    user, payload = _decode_current_user(credentials, db)
    _get_valid_session(user.id, payload, db, required=False)
    return user


def _decode_current_user(credentials: HTTPAuthorizationCredentials | None, db: Session) -> tuple[Any, dict]:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Bearer"})

    try:
        payload = decode_token(credentials.credentials)
        subject = payload.get("sub", payload.get("user_id"))
        user_id = int(subject)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authentication token", headers={"WWW-Authenticate": "Bearer"})

    user = get_user_by_id(db, user_id)
    if not user or not getattr(user, "is_active", False):
        raise HTTPException(status_code=401, detail="Invalid authentication token", headers={"WWW-Authenticate": "Bearer"})
    return user, payload


def _get_valid_session(user_id: int, payload: dict, db: Session, required: bool) -> Any:
    session_id = payload.get("sid")
    if not session_id:
        if required:
            raise HTTPException(status_code=401, detail="Session authentication required", headers={"WWW-Authenticate": "Bearer"})
        return None

    session = get_session_by_id(db, str(session_id))
    expires_at = getattr(session, "expires_at", None)
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if (
        session is None
        or getattr(session, "user_id", None) != user_id
        or getattr(session, "revoked_at", None) is not None
        or expires_at is None
        or expires_at <= datetime.now(timezone.utc)
    ):
        raise HTTPException(status_code=401, detail="Invalid authentication token", headers={"WWW-Authenticate": "Bearer"})
    return session


def get_current_session(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Any:
    """Validate a session-bound bearer token and return its session row."""
    user, payload = _decode_current_user(credentials, db)
    return _get_valid_session(user.id, payload, db, required=True)


def require_roles(*allowed_roles: str) -> Callable:
    """Build a dependency for endpoints that require a named user role."""
    normalized = {role.strip().lower() for role in allowed_roles if role and role.strip()}

    def _require_role(user: Any = Depends(get_current_user)) -> Any:
        role = getattr(getattr(user, "role", None), "name", "") or ""
        if role.lower() not in normalized:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return _require_role
