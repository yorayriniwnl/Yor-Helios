from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import pytest

from backend.app.core.security import hash_password
from backend.app.dependencies.auth import get_current_user
from backend.app.models.user import User
from backend.app.services.auth_service import (
    login_with_session,
    refresh_session,
    revoke_session_for_refresh_token,
)


def _create_user(db, email="session-service@example.com"):
    user = User(
        name="Session Service User",
        email=email,
        password_hash=hash_password("password123"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_refresh_rotates_and_rejects_the_previous_token(db):
    user = _create_user(db)

    first = login_with_session(db, user.email, "password123")
    second = refresh_session(db, first["refresh_token"])

    assert second["refresh_token"] != first["refresh_token"]
    with pytest.raises(ValueError):
        refresh_session(db, first["refresh_token"])


def test_logout_revokes_refresh_session(db):
    user = _create_user(db, "logout@example.com")
    bundle = login_with_session(db, user.email, "password123")

    revoke_session_for_refresh_token(db, bundle["refresh_token"])

    with pytest.raises(ValueError):
        refresh_session(db, bundle["refresh_token"])


def test_expired_refresh_session_is_rejected(db):
    user = _create_user(db, "expired@example.com")
    bundle = login_with_session(db, user.email, "password123")

    from backend.app.repositories.auth_session_repository import get_session_by_refresh_hash
    from backend.app.core.security import hash_refresh_token

    session = get_session_by_refresh_hash(db, hash_refresh_token(bundle["refresh_token"]))
    session.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    with pytest.raises(ValueError):
        refresh_session(db, bundle["refresh_token"])


def test_revoked_session_access_token_is_rejected(db):
    user = _create_user(db, "revoked-access@example.com")
    bundle = login_with_session(db, user.email, "password123")
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=bundle["access_token"])

    assert get_current_user(credentials, db).id == user.id
    revoke_session_for_refresh_token(db, bundle["refresh_token"])

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(credentials, db)
    assert exc_info.value.status_code == 401
