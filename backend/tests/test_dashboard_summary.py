from backend.app.models.alert import Alert
from backend.app.models.meter import Meter
from backend.app.models.zone import Zone
from backend.app.services.dashboard_service import get_summary


def test_dashboard_summary_separates_active_and_critical_alerts(db):
    zone = Zone(name="Summary Zone", city="Bengaluru", state="KA")
    meter = Meter(meter_number="M-SUMMARY-1", household_name="Summary site", status="active", zone=zone)
    db.add_all([zone, meter])
    db.flush()
    db.add_all([
        Alert(meter_id=meter.id, type="voltage_spike", severity="critical", status="open", score=0.9),
        Alert(meter_id=meter.id, type="tamper_suspicion", severity="critical", status="assigned", score=0.8),
        Alert(meter_id=meter.id, type="under_reporting", severity="medium", status="open", score=0.6),
        Alert(meter_id=meter.id, type="resolved_case", severity="critical", status="resolved", score=0.7),
    ])
    db.commit()

    summary = get_summary(db)

    assert summary["total_alerts"] == 4
    assert summary["open_alerts"] == 3
    assert summary["critical_alerts"] == 2
