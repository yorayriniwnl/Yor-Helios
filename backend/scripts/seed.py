#!/usr/bin/env python3
"""
Seed demo data: zones, meters, users, readings, and alerts.

Usage (from the `backend` directory):

python scripts/seed.py --zones 3 --meters-per-zone 12 --hours 6 --interval 5

The script is idempotent for zones, meter numbers, and user emails it creates
(skips existing). Demo users are always created, since login depends on them.

Alert behavior depends on --fast:
  - Without --fast, readings go through the real ingestion service, which
    runs anomaly detection and creates alerts organically (same code path a
    live meter feed would use).
  - With --fast, readings are written directly (skipping that per-reading
    service call for speed), so this script backfills alerts directly for
    the spike/night readings it just generated, using the same severity
    mapping as the real pipeline (see app.services.alert_service).
"""
import argparse
import math
import random
import time
from datetime import datetime, timedelta
from pathlib import Path

DEMO_USERS = [
    {"name": "Admin User", "email": "admin@example.com", "password": "adminpass123"},
    {"name": "Alice Inspector", "email": "alice@example.com", "password": "alicepass123"},
    {"name": "Bob Inspector", "email": "bob@example.com", "password": "bobpass123"},
    {"name": "Carol Operator", "email": "carol@example.com", "password": "carolpass123"},
]

# Weighted so most backfilled alerts are open, with a realistic minority
# already assigned or resolved (mirrors how a live queue would look).
ALERT_STATUSES = ["open", "open", "open", "assigned", "resolved"]


def parse_args():
    p = argparse.ArgumentParser(description="Seed demo zones, meters and readings")
    p.add_argument("--zones", type=int, default=3, help="Number of zones to create")
    p.add_argument("--meters-per-zone", type=int, default=12, help="Meters to create per zone")
    p.add_argument("--hours", type=float, default=6.0, help="How many hours of historical readings to seed")
    p.add_argument("--interval", type=int, default=5, help="Reading interval in minutes")
    p.add_argument("--start", type=str, default=None, help="ISO start timestamp (defaults to now - hours)")
    p.add_argument("--fast", action="store_true", help="Use faster ingestion (skip anomaly detection) where possible")
    return p.parse_args()


def ensure_path():
    # When run from project root, ensure we can import `app` package by adding backend to sys.path
    import sys

    here = Path(__file__).resolve().parents[1]
    if str(here) not in sys.path:
        sys.path.insert(0, str(here))


def _backfill_alert(db, Alert, reading, ts, is_spike, assignable_user_ids):
    """Directly insert an Alert for a spike/night reading created via the fast
    (repository-only) path, which skips the real anomaly-detection service.

    Mirrors app.services.alert_service's type -> severity mapping so demo data
    looks the same regardless of whether --fast was used.
    """
    try:
        alert_type = "high_power_spike" if is_spike else "abnormal_night_usage"
        severity = "high" if is_spike else "medium"
        score = round(random.uniform(0.55, 0.97) if is_spike else random.uniform(0.35, 0.72), 3)
        power = getattr(reading, "power_consumption", None)
        explanation = (
            f"Power spike detected: {power:.1f}W at {ts.strftime('%H:%M')}."
            if is_spike
            else f"Abnormal night usage: {power:.1f}W at {ts.strftime('%H:%M')}."
        )

        status = random.choice(ALERT_STATUSES)
        assigned_to = random.choice(assignable_user_ids) if status in ("assigned", "resolved") and assignable_user_ids else None
        resolved_at = ts + timedelta(hours=random.uniform(0.5, 4)) if status == "resolved" else None

        alert = Alert(
            meter_id=getattr(reading, "meter_id", None),
            reading_id=getattr(reading, "id", None),
            type=alert_type,
            score=score,
            severity=severity,
            explanation=explanation,
            status=status,
            assigned_to=assigned_to,
            created_at=ts,
            resolved_at=resolved_at,
        )
        db.add(alert)
        db.commit()
        return True
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return False


def main():
    args = parse_args()
    ensure_path()

    # Local imports (after sys.path adjusted)
    from app.core.database import SessionLocal
    from app.core.security import hash_password
    from app.services.zone_service import create_zone as svc_create_zone
    from app.services.meter_service import create_meter as svc_create_meter
    from app.services.reading_service import create_reading as svc_create_reading
    from app.repositories.reading_repository import create_reading as repo_create_reading
    from app.services.user_service import create_user as svc_create_user
    from app.services.role_service import DEMO_ROLE_BY_EMAIL, backfill_null_roles, ensure_default_roles
    from app.models.zone import Zone
    from app.models.meter import Meter
    from app.models.user import User
    from app.models.alert import Alert
    from app.models.transformer import Transformer

    db = SessionLocal()

    try:
        demo_roles = ensure_default_roles(db)
        backfill_null_roles(db)

        sample_zone_names = [
            "Northside",
            "Riverside",
            "Downtown",
            "West End",
            "East Ridge",
            "Lakeshore",
            "Hillcrest",
        ]

        zone_names = sample_zone_names[: args.zones]

        print(f"Seeding {len(zone_names)} zones")
        created_zones = []
        for name in zone_names:
            # idempotent: reuse existing zone with same name
            existing = db.query(Zone).filter(Zone.name == name).first()
            if existing:
                print(f" - zone exists: {name} (id={existing.id})")
                created_zones.append(existing)
                continue
            z = svc_create_zone(db, name=name)
            print(f" - created zone: {name} (id={z.id})")
            created_zones.append(z)

        print("Seeding transformers")
        total_transformers = 0
        for zone in created_zones:
            existing_count = db.query(Transformer).filter(Transformer.zone_id == zone.id).count()
            if existing_count > 0:
                print(f" - transformers exist for zone {zone.name}: {existing_count}")
                continue
            for i in range(random.randint(1, 2)):
                # Mostly healthy load; occasionally push one into warning/critical
                # range (see app.services.transformer_service thresholds: >95
                # critical, >80 warning) so the dashboard shows some variety.
                roll = random.random()
                load = random.uniform(40, 75) if roll < 0.7 else random.uniform(82, 97)
                t = Transformer(
                    zone_id=zone.id,
                    name=f"{zone.name} Transformer {i + 1}",
                    capacity=round(random.uniform(200, 500), 1),
                    load_percent=round(load, 1),
                )
                db.add(t)
                total_transformers += 1
        db.commit()
        print(f"Created {total_transformers} transformers")

        total_meters = 0
        created_meters = []
        print(f"Creating up to {args.meters_per_zone} meters per zone")
        for z in created_zones:
            for i in range(args.meters_per_zone):
                meter_number = f"{z.name[:3].upper()}-{i+1:04d}"
                # skip if meter exists
                existing_m = db.query(Meter).filter(Meter.meter_number == meter_number).first()
                if existing_m:
                    created_meters.append(existing_m)
                    continue
                m = svc_create_meter(db, meter_number=meter_number, household_name=f"Household {i+1}")
                # attach to zone and set coordinates (repository create_meter accepts neither)
                try:
                    m.zone_id = z.id
                    # Same Bengaluru-centered convention as frontend/lib/demo.ts, so a
                    # real backend and demo mode plot meters in the same general area.
                    m.latitude = 12.9716 + random.uniform(-0.06, 0.06) + z.id * 0.015
                    m.longitude = 77.5946 + random.uniform(-0.06, 0.06) + z.id * 0.015
                    db.add(m)
                    db.commit()
                    db.refresh(m)
                except Exception:
                    db.rollback()
                created_meters.append(m)
                total_meters += 1

        print(f"Created/Found meters: {len(created_meters)} (newly created: {total_meters})")

        print(f"Seeding {len(DEMO_USERS)} demo users")
        created_users = []
        for uspec in DEMO_USERS:
            existing_u = db.query(User).filter(User.email == uspec["email"]).first()
            if existing_u:
                existing_u.role_id = demo_roles[DEMO_ROLE_BY_EMAIL[uspec["email"]]].id
                db.commit()
                print(f" - user exists: {uspec['email']} (id={existing_u.id})")
                created_users.append(existing_u)
                continue
            try:
                u = svc_create_user(
                    db,
                    name=uspec["name"],
                    email=uspec["email"],
                    password_hash=hash_password(uspec["password"]),
                    role_id=demo_roles[DEMO_ROLE_BY_EMAIL[uspec["email"]]].id,
                )
                print(f" - created user: {u.email} (id={u.id})")
                created_users.append(u)
            except ValueError:
                # Raised by user_service when the email already exists (race with another run)
                existing_u = db.query(User).filter(User.email == uspec["email"]).first()
                if existing_u:
                    created_users.append(existing_u)

        # Users other than the first (admin) are the ones alerts get assigned to
        assignable_user_ids = [u.id for u in created_users[1:]] or [u.id for u in created_users]

        # Prepare reading timeline
        interval = timedelta(minutes=args.interval)
        points = max(1, int(args.hours * 60 // args.interval))
        if args.start:
            start = datetime.fromisoformat(args.start)
        else:
            start = datetime.utcnow() - timedelta(hours=args.hours)

        print(f"Seeding {points} readings per meter ({args.hours}h @ {args.interval}m)")

        meter_count = len(created_meters)
        progress = 0
        t0 = time.time()

        total_alerts = 0

        for mi, m in enumerate(created_meters):
            # per-meter base consumption
            base = random.uniform(60.0, 600.0)
            voltage_base = random.uniform(220.0, 240.0)
            for p in range(points):
                ts = start + p * interval
                hour = ts.hour

                # diurnal shape: rises through the day, falls off overnight,
                # so consumption charts look like real usage instead of flat noise
                diurnal = math.sin((hour - 6) * math.pi / 12) if 6 <= hour <= 22 else -0.6
                noise = random.uniform(-0.06, 0.06)  # +-6%
                power = max(0.1, base * (1.0 + 0.35 * diurnal + noise))

                is_spike = random.random() < 0.015
                is_night_anomaly = False
                if is_spike:
                    power *= random.uniform(2.0, 4.5)
                elif hour >= 23 or hour < 6:
                    is_night_anomaly = random.random() < 0.05
                    if is_night_anomaly:
                        power = random.uniform(550.0, 900.0)

                voltage = voltage_base * (1.0 + random.uniform(-0.02, 0.02))
                current = power / max(1.0, voltage)

                try:
                    if args.fast:
                        reading = repo_create_reading(db, meter_id=m.id, timestamp=ts, voltage=round(voltage, 2), current=round(current, 3), power_consumption=round(power, 2))
                        if is_spike or is_night_anomaly:
                            if _backfill_alert(db, Alert, reading, ts, is_spike, assignable_user_ids):
                                total_alerts += 1
                    else:
                        svc_create_reading(db, meter_id=m.id, timestamp=ts, voltage=round(voltage, 2), current=round(current, 3), power_consumption=round(power, 2))
                except Exception as e:
                    print(f"  ! failed to write reading for meter {m.id}: {e}")
                    try:
                        db.rollback()
                    except Exception:
                        pass

            progress += 1
            if progress % 5 == 0 or progress == meter_count:
                elapsed = time.time() - t0
                print(f"  seeded readings for {progress}/{meter_count} meters (elapsed: {int(elapsed)}s)")

        if args.fast:
            print(f"Backfilled {total_alerts} alerts for spike/night readings.")
        print("Seeding complete.")
        print(f"Login: {DEMO_USERS[0]['email']} / {DEMO_USERS[0]['password']}")

    finally:
        try:
            db.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
