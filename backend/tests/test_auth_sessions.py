from datetime import datetime, timedelta, timezone

from backend.app.models.user import User
from backend.app.repositories.auth_session_repository import (
    create_session,
    get_session_by_id,
    get_session_by_refresh_hash,
    revoke_session,
)


def test_session_round_trip_and_revocation(db):
    user = User(
        name="Session User",
        email="session@example.com",
        password_hash="hashed-password",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    session = create_session(db, user.id, "sid-1", "hash-1", expires_at)

    assert get_session_by_id(db, "sid-1").user_id == user.id
    assert get_session_by_refresh_hash(db, "hash-1").session_id == "sid-1"

    revoke_session(db, session)
    db.refresh(session)
    assert session.revoked_at is not None
