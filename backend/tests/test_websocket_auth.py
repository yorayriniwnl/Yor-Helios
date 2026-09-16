import pytest

from backend.app.api.websocket.live import authenticate_websocket_token
from backend.app.models.user import User
from backend.app.services.auth_service import login_with_session, revoke_session_for_refresh_token
from backend.app.core.security import hash_password


def test_revoked_session_access_token_cannot_open_websocket(db):
    user = User(
        name="WebSocket User",
        email="websocket@example.com",
        password_hash=hash_password("password123"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    bundle = login_with_session(db, user.email, "password123")
    revoke_session_for_refresh_token(db, bundle["refresh_token"])

    with pytest.raises(ValueError):
        authenticate_websocket_token(db, bundle["access_token"])
