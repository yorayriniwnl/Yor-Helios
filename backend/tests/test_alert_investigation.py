import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import httpx
from httpx import ASGITransport

import backend.app.api.v1.routes.auth as auth_routes
import backend.app.core.database as core_db
import backend.app.dependencies.auth as auth_dependencies
from backend.app.main import app
from backend.app.models.alert import Alert
from backend.app.models.anomaly_event import AnomalyEvent
from backend.app.models.audit_log import AuditLog
from backend.app.models.evidence import Evidence
from backend.app.models.meter import Meter
from backend.app.models.reading import Reading
from backend.app.models.zone import Zone


def test_alert_investigation_returns_bounded_context(db):
    zone = Zone(name="North Feeder", city="Bengaluru", state="KA")
    meter = Meter(meter_number="M-INV-1", household_name="Inspection site", status="active", zone=zone)
    db.add_all([zone, meter])
    db.flush()
    reading = Reading(
        meter_id=meter.id,
        timestamp=datetime(2026, 9, 2, 10, 0, tzinfo=timezone.utc),
        voltage=0.0,
        current=2.5,
        power_consumption=0.0,
    )
    db.add(reading)
    db.flush()
    alert = Alert(
        meter_id=meter.id,
        reading_id=reading.id,
        type="tamper_suspicion",
        score=0.82,
        severity="high",
        status="assigned",
        assigned_to=None,
        explanation="Observed under-reporting pattern.",
    )
    db.add(alert)
    db.flush()
    anomaly = AnomalyEvent(
        meter_id=meter.id,
        reading_id=reading.id,
        type="under_reporting",
        score=0.82,
        explanation="Power fell below the learned baseline.",
    )
    evidence = Evidence(
        alert_id=alert.id,
        file_path="/tmp/helios-evidence/example.jpg",
        original_filename="example.jpg",
        notes="Seal inspected.",
        before_after="before",
    )
    db.add_all([anomaly, evidence])
    db.commit()
    db.refresh(alert)

    audit = AuditLog(
        action="alert_assigned",
        entity="alert",
        entity_id=alert.id,
        metadata_json='{"assigned_to": 7}',
    )
    db.add(audit)
    db.commit()

    app.dependency_overrides[core_db.get_db] = lambda: db
    app.dependency_overrides[auth_dependencies.get_current_user] = lambda: SimpleNamespace(id=7, is_active=True)

    async def _run():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.get(f"/api/v1/alerts/{alert.id}")
            assert response.status_code == 200
            payload = response.json()
            assert payload["alert"]["id"] == alert.id
            assert payload["meter"]["meter_number"] == "M-INV-1"
            assert payload["zone"]["name"] == "North Feeder"
            assert payload["reading"]["voltage"] == 0.0
            assert payload["investigation"]["score_is_probability"] is False
            assert payload["investigation"]["evidence_state"] == "MEASURED_READING"
            assert "not a calibrated probability" in payload["investigation"]["uncertainty"][0]
            assert payload["evidence"][0]["original_filename"] == "example.jpg"
            assert any(item["event"] == "alert_assigned" for item in payload["timeline"])

            missing = await client.get("/api/v1/alerts/999999")
            assert missing.status_code == 404

    try:
        asyncio.run(_run())
    finally:
        app.dependency_overrides.clear()
