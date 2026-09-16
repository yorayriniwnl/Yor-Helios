import httpx
import asyncio
from httpx import ASGITransport
from types import SimpleNamespace

import backend.app.core.database as core_db
import backend.app.api.v1.routes.auth as auth_routes
import backend.app.api.v1.routes.meters as meters_routes
import backend.app.api.v1.routes.readings as readings_routes
import backend.app.dependencies.auth as auth_dependencies

from backend.app.main import app


try:
    from httpx import ASGITransport
    client = httpx.Client(transport=ASGITransport(app=app), base_url="http://testserver")
except Exception:
    # fallback: use httpx without ASGITransport (should not happen in CI)
    client = httpx.Client()


def _override_db():
    # dependency override: return a dummy DB/session placeholder
    return None


def _override_user():
    return SimpleNamespace(id=1, is_active=True, role=SimpleNamespace(name="operator"))


def _override_admin_user():
    return SimpleNamespace(id=1, is_active=True, role=SimpleNamespace(name="admin"))


def test_auth_route_login_success_and_failure(monkeypatch):
    # Ensure DB and rate-limit dependencies are no-ops
    app.dependency_overrides[core_db.get_db] = _override_db
    try:
        import backend.app.dependencies.rate_limiter as rl_dep
        app.dependency_overrides[rl_dep.login_rate_limit] = lambda: None
    except Exception:
        pass

    # Successful login (use AsyncClient via ASGITransport)
    monkeypatch.setattr(auth_routes, "auth_login", lambda db, email, password: "token-xyz")

    async def _run_success():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
            resp = await ac.post("/api/v1/auth/login", json={"email": "u@example.com", "password": "password123"})
            assert resp.status_code == 200
            assert resp.json().get("access_token") == "token-xyz"

    asyncio.run(_run_success())

    # Invalid credentials → 401
    def _bad_login(db, email, password):
        raise ValueError("Invalid credentials")

    monkeypatch.setattr(auth_routes, "auth_login", _bad_login)

    async def _run_fail():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
            resp2 = await ac.post("/api/v1/auth/login", json={"email": "u@example.com", "password": "password123"})
            assert resp2.status_code == 401

    asyncio.run(_run_fail())

    app.dependency_overrides.clear()


def test_meters_crud_endpoints(monkeypatch):
    app.dependency_overrides[core_db.get_db] = _override_db
    app.dependency_overrides[auth_dependencies.get_current_user] = _override_admin_user

    # Stub service layer used by the meters router
    monkeypatch.setattr(
        meters_routes,
        "service_create_meter",
        lambda db, meter_number, household_name, status, zone_id=None, latitude=None, longitude=None: {"id": 1, "meter_number": meter_number, "household_name": household_name, "status": status, "zone_id": zone_id, "latitude": latitude, "longitude": longitude},
    )
    monkeypatch.setattr(
        meters_routes,
        "service_list_meters",
        lambda db, skip=0, limit=100: [{"id": 1, "meter_number": "M-1", "household_name": "House A", "status": "active"}],
    )
    monkeypatch.setattr(
        meters_routes,
        "service_get_meter_by_id",
        lambda db, meter_id: {"id": meter_id, "meter_number": "M-1", "household_name": "House A", "status": "active"} if meter_id == 1 else None,
    )

    async def _run_meters():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
            # Create
            r = await ac.post("/api/v1/meters/", json={"meter_number": "M-1", "household_name": "House A", "status": "active"})
            assert r.status_code == 200
            assert r.json()["meter_number"] == "M-1"

            # List
            r2 = await ac.get("/api/v1/meters/")
            assert r2.status_code == 200
            assert isinstance(r2.json(), list) and len(r2.json()) >= 1

            # Get existing
            r3 = await ac.get("/api/v1/meters/1")
            assert r3.status_code == 200
            assert r3.json()["id"] == 1

            # Get non-existing -> 404
            r4 = await ac.get("/api/v1/meters/9999")
            assert r4.status_code == 404

    asyncio.run(_run_meters())

    app.dependency_overrides.clear()


def test_readings_create_and_list(monkeypatch):
    app.dependency_overrides[core_db.get_db] = _override_db
    app.dependency_overrides[auth_dependencies.get_current_user] = _override_user
    try:
        import backend.app.dependencies.rate_limiter as rl_dep
        app.dependency_overrides[rl_dep.readings_rate_limit] = lambda: None
    except Exception:
        pass

    # Stub reading services
    monkeypatch.setattr(
        readings_routes,
        "service_create_reading",
        lambda db, meter_id, timestamp, voltage, current, power_consumption, ingest_key=None: {"id": 10, "meter_id": meter_id, "timestamp": timestamp, "voltage": voltage, "current": current, "power_consumption": power_consumption},
    )
    monkeypatch.setattr(
        readings_routes,
        "service_get_readings_by_meter",
        lambda db, meter_id, skip=0, limit=100: [{"id": 10, "meter_id": meter_id, "timestamp": "2023-01-01T00:00:00Z", "voltage": 230.0, "current": 1.2, "power_consumption": 276.0}],
    )

    async def _run_readings():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
            payload = {"meter_id": 1, "timestamp": "2023-01-01T00:00:00Z", "voltage": 230.0, "current": 1.2, "power_consumption": 276.0}
            rc = await ac.post("/api/v1/readings/", json=payload)
            assert rc.status_code == 200
            assert rc.json()["id"] == 10

            # List by meter
            rl = await ac.get("/api/v1/readings/by-meter/1")
            assert rl.status_code == 200
            assert isinstance(rl.json(), list)

    asyncio.run(_run_readings())

    app.dependency_overrides.clear()
