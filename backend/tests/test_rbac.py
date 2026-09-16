import asyncio
from types import SimpleNamespace

import httpx
from httpx import ASGITransport

from backend.app.core import database as core_db
from backend.app.dependencies import auth as auth_dependencies
from backend.app.dependencies import rate_limiter as rate_limiter_dependencies
from backend.app.main import app
from backend.app.models.role import Role
from backend.app.models.audit_log import AuditLog
from backend.app.models.user import User


def _user_for_role(role_name: str):
    return SimpleNamespace(
        id=1,
        is_active=True,
        role=SimpleNamespace(name=role_name),
    )


def test_reading_ingestion_requires_operator_or_admin(db, monkeypatch):
    from backend.app.api.v1.routes import readings as readings_routes

    monkeypatch.setattr(
        readings_routes,
        "service_create_reading",
        lambda *args, **kwargs: {
            "id": 10,
            "meter_id": kwargs["meter_id"],
            "timestamp": kwargs["timestamp"],
            "voltage": kwargs["voltage"],
            "current": kwargs["current"],
            "power_consumption": kwargs["power_consumption"],
        },
    )
    app.dependency_overrides[core_db.get_db] = lambda: db
    app.dependency_overrides[readings_routes.readings_rate_limit] = lambda: None

    async def _run():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            payload = {
                "meter_id": 1,
                "timestamp": "2026-09-13T10:00:00Z",
                "voltage": 230,
                "current": 1,
                "power_consumption": 230,
            }
            for role, expected in (("viewer", 403), ("inspector", 403), ("operator", 200), ("admin", 200)):
                app.dependency_overrides[auth_dependencies.get_current_user] = lambda role=role: _user_for_role(role)
                response = await client.post("/api/v1/readings/", json=payload)
                assert response.status_code == expected, role

    try:
        asyncio.run(_run())
    finally:
        app.dependency_overrides.pop(core_db.get_db, None)
        app.dependency_overrides.pop(readings_routes.readings_rate_limit, None)
        app.dependency_overrides.pop(auth_dependencies.get_current_user, None)


def test_registration_always_assigns_viewer_role(db):
    viewer = Role(name="viewer")
    db.add(viewer)
    db.commit()
    db.refresh(viewer)

    app.dependency_overrides[core_db.get_db] = lambda: db
    app.dependency_overrides[rate_limiter_dependencies.registration_rate_limit] = lambda: None

    async def _run():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.post(
                "/api/v1/users/",
                json={
                    "name": "New Viewer",
                    "email": "new-viewer@example.com",
                    "password": "password123",
                    "role_id": 999,
                },
            )
            assert response.status_code == 200
            assert response.json()["role_id"] == viewer.id

    try:
        asyncio.run(_run())
    finally:
        app.dependency_overrides.pop(core_db.get_db, None)
        app.dependency_overrides.pop(rate_limiter_dependencies.registration_rate_limit, None)


def test_only_admin_can_change_roles_and_last_admin_cannot_self_demote(db):
    from backend.app.api.v1.routes import users as users_routes
    from backend.app.core.security import hash_password

    admin_role = Role(name="admin")
    viewer_role = Role(name="viewer")
    db.add_all([admin_role, viewer_role])
    db.commit()
    db.refresh(admin_role)
    db.refresh(viewer_role)
    target = User(name="Target", email="target@example.com", password_hash=hash_password("password123"), role_id=viewer_role.id)
    admin = User(name="Admin", email="role-admin@example.com", password_hash=hash_password("password123"), role_id=admin_role.id)
    db.add_all([target, admin])
    db.commit()
    db.refresh(target)
    db.refresh(admin)

    app.dependency_overrides[core_db.get_db] = lambda: db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: admin

    async def _run():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.patch(f"/api/v1/users/{target.id}/role", json={"role_name": "operator"})
            assert response.status_code == 200
            db.refresh(target)
            assert target.role.name == "operator"
            audit = db.query(AuditLog).filter(AuditLog.action == "user_role_changed", AuditLog.entity_id == target.id).first()
            assert audit is not None
            assert '"role": "operator"' in (audit.metadata_json or "")

            app.dependency_overrides[auth_dependencies.get_current_user] = lambda: target
            response = await client.patch(f"/api/v1/users/{target.id}/role", json={"role_name": "viewer"})
            assert response.status_code == 403

            app.dependency_overrides[auth_dependencies.get_current_user] = lambda: admin
            response = await client.patch(f"/api/v1/users/{admin.id}/role", json={"role_name": "viewer"})
            assert response.status_code == 409

    try:
        asyncio.run(_run())
    finally:
        app.dependency_overrides.pop(core_db.get_db, None)
        app.dependency_overrides.pop(auth_dependencies.get_current_user, None)
