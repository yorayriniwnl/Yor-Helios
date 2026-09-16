import asyncio

import httpx
from httpx import ASGITransport

from backend.app import core as _core  # noqa: F401
from backend.app.core import database as core_db
from backend.app.core.security import hash_password
from backend.app.dependencies import rate_limiter as rate_limiter_dependencies
from backend.app.main import app
from backend.app.models.user import User


def test_login_refresh_and_logout_contract(db):
    user = User(
        name="Auth Route User",
        email="auth-route@example.com",
        password_hash=hash_password("password123"),
        is_active=True,
    )
    db.add(user)
    db.commit()

    app.dependency_overrides[core_db.get_db] = lambda: db
    app.dependency_overrides[rate_limiter_dependencies.login_rate_limit] = lambda: None
    app.dependency_overrides[rate_limiter_dependencies.refresh_rate_limit] = lambda: None

    async def _run():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            login = await client.post(
                "/api/v1/auth/login",
                json={"email": "auth-route@example.com", "password": "password123"},
            )
            assert login.status_code == 200
            first = login.json()
            assert first["refresh_token"]

            refreshed = await client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": first["refresh_token"]},
            )
            assert refreshed.status_code == 200
            second = refreshed.json()
            assert second["refresh_token"] != first["refresh_token"]

            logout = await client.post(
                "/api/v1/auth/logout",
                headers={"Authorization": f"Bearer {second['access_token']}"},
                json={"refresh_token": second["refresh_token"]},
            )
            assert logout.status_code == 204

            invalidated_access = await client.get(
                "/api/v1/dashboard/summary",
                headers={"Authorization": f"Bearer {second['access_token']}"},
            )
            assert invalidated_access.status_code == 401

            reused = await client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": second["refresh_token"]},
            )
            assert reused.status_code == 401

    try:
        asyncio.run(_run())
    finally:
        app.dependency_overrides.pop(core_db.get_db, None)
        app.dependency_overrides.pop(rate_limiter_dependencies.login_rate_limit, None)
        app.dependency_overrides.pop(rate_limiter_dependencies.refresh_rate_limit, None)
