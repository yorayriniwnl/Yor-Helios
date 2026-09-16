#!/usr/bin/env python3
"""Seed script for Helios backend.

Creates sample zones, meters, users, readings, anomaly events and alerts
for realistic local development and demo runs.

Run from the repository root:

    python scripts/seed.py            # full seed
    python scripts/seed.py --fast     # minimal (no historical readings)
    python scripts/seed.py --reset    # drop & recreate all data

Pass --fast to hackathon_setup scripts so the first run finishes quickly.
"""
from __future__ import annotations

import argparse
import logging
import math
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("helios.seed")

# ── tunable constants ────────────────────────────────────────────────────────
ZONES = [
    {"name": "Downtown",  "city": "Springfield", "state": "CA"},
    {"name": "Northside", "city": "Springfield", "state": "CA"},
    {"name": "Westgrove", "city": "Springfield", "state": "CA"},
    {"name": "Eastpark",  "city": "Springfield", "state": "CA"},
    {"name": "Midtown",   "city": "Springfield", "state": "CA"},
    {"name": "Riverside", "city": "Springfield", "state": "CA"},
]

USERS = [
    {"name": "Admin User",    "email": "admin@example.com",    "password": "adminpass123"},
    {"name": "Alice Inspector","email": "alice@example.com",   "password": "alicepass"},
    {"name": "Bob Inspector",  "email": "bob@example.com",     "password": "bobpass"},
    {"name": "Carol Operator", "email": "carol@example.com",   "password": "carolpass"},
]

METERS_PER_ZONE = 8
READINGS_PER_METER = 48      # 24h of half-hourly readings
ANOMALY_RATE = 0.12          # fraction of readings that trigger an anomaly


# ── helpers ──────────────────────────────────────────────────────────────────

def _rnd(lo: float, hi: float) -> float:
    return random.uniform(lo, hi)


def _normal_power(meter_id: int, hour: int) -> float:
    """Simulate diurnal power pattern: low at night, peak morning/evening."""
    base = 60 + (meter_id % 10) * 8
    diurnal = math.sin((hour - 6) * math.pi / 12) * 120 if 6 <= hour <= 22 else 0
    noise = _rnd(-25, 40)
    return max(5.0, base + diurnal + noise)


def _spike_power() -> float:
    return _rnd(3000, 8000)


def _night_power(meter_id: int) -> float:
    return _rnd(520, 900)


# ── main seed ────────────────────────────────────────────────────────────────

def seed(fast: bool = False, reset: bool = False) -> None:
    try:
        from backend.app.core.database import SessionLocal, engine, Base
        from backend.app.core.security import hash_password
        from backend.app.services.role_service import DEMO_ROLE_BY_EMAIL, backfill_null_roles, ensure_default_roles
        from backend.app.models.zone import Zone
        from backend.app.models.meter import Meter
        from backend.app.models.user import User
        from backend.app.models.reading import Reading
        from backend.app.models.alert import Alert
        from backend.app.repositories.zone_repository import create_zone
        from backend.app.repositories.meter_repository import create_meter
    except ImportError as exc:
        logger.error("Cannot import backend models: %s", exc)
        logger.error("Run from the repository root with the venv active.")
        sys.exit(1)

    if reset:
        logger.warning("--reset: dropping all tables…")
        Base.metadata.drop_all(bind=engine)

    logger.info("Ensuring DB tables exist…")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    rng = random.Random(42)

    try:
        demo_roles = ensure_default_roles(db)
        backfill_null_roles(db)

        # ── Zones ─────────────────────────────────────────────────────────
        created_zones: List[Zone] = []
        for zspec in ZONES:
            existing = db.query(Zone).filter(Zone.name == zspec["name"]).first()
            if existing:
                created_zones.append(existing)
            else:
                z = create_zone(db, name=zspec["name"], city=zspec.get("city"), state=zspec.get("state"))
                created_zones.append(z)
                logger.info("Zone: %s (id=%s)", z.name, z.id)

        # ── Users ─────────────────────────────────────────────────────────
        created_users: List[User] = []
        for uspec in USERS:
            existing = db.query(User).filter(User.email == uspec["email"]).first()
            if existing:
                existing.role_id = demo_roles[DEMO_ROLE_BY_EMAIL[uspec["email"]]].id
                db.commit()
                created_users.append(existing)
            else:
                hashed = hash_password(uspec["password"])
                u = User(
                    name=uspec["name"],
                    email=uspec["email"],
                    password_hash=hashed,
                    role_id=demo_roles[DEMO_ROLE_BY_EMAIL[uspec["email"]]].id,
                )
                db.add(u)
                try:
                    db.commit()
                    db.refresh(u)
                    created_users.append(u)
                    logger.info("User: %s", u.email)
                except Exception:
                    db.rollback()
                    u = db.query(User).filter(User.email == uspec["email"]).first()
                    if u:
                        created_users.append(u)

        # ── Meters ────────────────────────────────────────────────────────
        created_meters: List[Meter] = []
        for zone in created_zones:
            for i in range(1, METERS_PER_ZONE + 1):
                mn = f"{zone.name[:3].upper()}-{1000 + i}"
                existing = db.query(Meter).filter(Meter.meter_number == mn).first()
                if existing:
                    created_meters.append(existing)
                    continue
                m = create_meter(db, meter_number=mn, household_name=f"{zone.name} House {i}")
                try:
                    m.zone_id = zone.id
                    m.latitude = _rnd(37.70, 37.82)
                    m.longitude = _rnd(-122.52, -122.38)
                    db.add(m)
                    db.commit()
                    db.refresh(m)
                    created_meters.append(m)
                except Exception:
                    db.rollback()
                    existing = db.query(Meter).filter(Meter.meter_number == mn).first()
                    if existing:
                        created_meters.append(existing)

        logger.info("%d meters ready.", len(created_meters))

        if fast:
            logger.info("--fast mode: skipping historical readings/alerts. Done.")
            return

        # ── Readings + Anomalies + Alerts ─────────────────────────────────
        now = datetime.utcnow()
        total_readings = 0
        total_alerts = 0

        for meter in created_meters:
            existing_count = db.query(Reading).filter(Reading.meter_id == meter.id).count()
            if existing_count >= READINGS_PER_METER:
                total_readings += existing_count
                continue

            prev_power: Optional[float] = None

            for j in range(READINGS_PER_METER):
                ts = now - timedelta(minutes=(READINGS_PER_METER - j) * 30)
                hour = ts.hour

                # decide anomaly type
                roll = rng.random()
                is_spike = roll < 0.05
                is_night = (not is_spike) and (hour < 6 or hour >= 23) and rng.random() < 0.15
                is_normal = not is_spike and not is_night

                if is_spike:
                    power = _spike_power()
                elif is_night:
                    power = _night_power(meter.id)
                else:
                    power = _normal_power(meter.id, hour)

                voltage = _rnd(215, 240)
                current = max(0.1, power / voltage) if voltage else 1.0

                reading = Reading(
                    meter_id=meter.id,
                    timestamp=ts,
                    voltage=round(voltage, 2),
                    current=round(current, 3),
                    power_consumption=round(power, 2),
                )
                db.add(reading)
                try:
                    db.flush()
                except Exception:
                    db.rollback()
                    continue

                total_readings += 1

                # Create alert for anomalous readings
                should_alert = is_spike or is_night
                if should_alert:
                    a_type = "high_power_spike" if is_spike else "abnormal_night_usage"
                    severity = "high" if is_spike else "medium"
                    score = round(_rnd(0.55, 0.97) if is_spike else _rnd(0.35, 0.72), 3)
                    explanation = (
                        f"Power spike: {prev_power:.1f}W → {power:.1f}W (ratio {power/max(1,prev_power):.2f})."
                        if is_spike and prev_power
                        else f"Night usage: {power:.1f}W at {ts.strftime('%H:%M')}."
                    )
                    status = rng.choice(["open", "open", "assigned", "resolved"])
                    assigned_to = rng.choice([u.id for u in created_users[1:]]) if status in ("assigned", "resolved") else None
                    resolved_at = ts + timedelta(hours=_rnd(0.5, 4)) if status == "resolved" else None

                    alert = Alert(
                        meter_id=meter.id,
                        reading_id=reading.id,
                        type=a_type,
                        score=score,
                        severity=severity,
                        explanation=explanation,
                        status=status,
                        assigned_to=assigned_to,
                        created_at=ts,
                        resolved_at=resolved_at,
                    )
                    db.add(alert)
                    total_alerts += 1

                prev_power = power

            try:
                db.commit()
            except Exception as exc:
                logger.warning("Commit error for meter %s: %s", meter.id, exc)
                db.rollback()

        logger.info("Seeded %d readings and %d alerts.", total_readings, total_alerts)
        logger.info("Done. Login: admin@example.com / adminpass123")

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Helios demo data")
    parser.add_argument("--fast", action="store_true", help="Skip readings/alerts (quick start)")
    parser.add_argument("--reset", action="store_true", help="Drop all tables before seeding")
    args = parser.parse_args()
    seed(fast=args.fast, reset=args.reset)
