#!/usr/bin/env python3
"""Helios ML Training CLI.

Trains the IsolationForest anomaly-detection model and saves it to
`saved_models/isolation_forest.joblib`.

Usage
-----
From the project root:

    python ml-engine/training/train.py                     # train with DB data
    python ml-engine/training/train.py --synthetic 5000    # train with 5k synthetic samples
    python ml-engine/training/train.py --out path/to/model.joblib

The script tries to load real readings from the project's SQLite / Postgres DB
(via the backend ORM). If the DB is unavailable or empty it falls back to a
synthetic dataset so you can always produce a valid model for demo runs.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

# ── paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_PATH = ROOT / "saved_models" / "isolation_forest.joblib"


# ── helpers ──────────────────────────────────────────────────────────────────

def _check_deps():
    missing = []
    for pkg in ("numpy", "pandas", "sklearn", "joblib"):
        try:
            __import__(pkg if pkg != "sklearn" else "sklearn")
        except ImportError:
            missing.append(pkg if pkg != "sklearn" else "scikit-learn")
    if missing:
        print(f"[train] Missing packages: {', '.join(missing)}")
        print("        Install with: pip install numpy pandas scikit-learn joblib")
        sys.exit(1)


def _load_from_db(limit: int = 10_000):
    """Try to load real readings from the backend database."""
    import importlib.util

    # Try to import backend models via the installed package path
    backend_init = ROOT / "backend" / "app" / "__init__.py"
    if not backend_init.exists():
        return None

    # database.py resolves its own imports as `from backend.app.core.config
    # import settings`, falling back to a relative import only if that fails.
    # The relative fallback can never work for a module loaded via
    # spec_from_file_location (no parent package), so the repo root must be
    # on sys.path for the absolute form to succeed on the first try.
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    try:
        spec = importlib.util.spec_from_file_location(
            "backend_app", str(ROOT / "backend" / "app" / "core" / "database.py")
        )
        db_mod = importlib.util.module_from_spec(spec)  # type: ignore
        spec.loader.exec_module(db_mod)  # type: ignore

        SessionLocal = db_mod.SessionLocal
        db = SessionLocal()
        try:
            # Query via raw SQL to avoid importing full ORM
            from sqlalchemy import text as sa_text

            rows = db.execute(
                sa_text(
                    "SELECT power_consumption, voltage, current FROM readings "
                    "WHERE power_consumption IS NOT NULL LIMIT :lim"
                ),
                {"lim": limit},
            ).fetchall()
            if not rows:
                return None
            return [{"power_consumption": r[0], "voltage": r[1], "current": r[2]} for r in rows]
        finally:
            db.close()
    except Exception as exc:
        print(f"[train] DB load skipped ({exc}); using synthetic data.")
        return None


def _generate_synthetic(n: int = 5_000):
    """Generate synthetic meter readings for training."""
    import numpy as np

    rng = np.random.default_rng(42)
    n_normal = int(n * 0.95)
    n_anomaly = n - n_normal

    # Normal readings: power 50–500 W, voltage 210–240 V, current 0.2–2.5 A
    power_n   = rng.uniform(50, 500, n_normal)
    voltage_n = rng.uniform(210, 240, n_normal)
    current_n = rng.uniform(0.2, 2.5, n_normal)

    # Anomalous readings: power spikes 3000–8000 W or near-zero
    power_a = rng.choice(
        [rng.uniform(3000, 8000, n_anomaly), rng.uniform(0, 5, n_anomaly)],
        axis=0,
    ).flatten()[:n_anomaly]
    voltage_a = rng.uniform(180, 260, n_anomaly)
    current_a = rng.uniform(0, 35, n_anomaly)

    power   = np.concatenate([power_n, power_a])
    voltage = np.concatenate([voltage_n, voltage_a])
    current = np.concatenate([current_n, current_a])

    return [
        {"power_consumption": float(p), "voltage": float(v), "current": float(c)}
        for p, v, c in zip(power, voltage, current)
    ]


def _build_feature_matrix(records):
    import numpy as np

    def first_present(record, *keys):
        for key in keys:
            value = record.get(key) if isinstance(record, dict) else getattr(record, key, None)
            if value is not None:
                return value
        return None

    rows = []
    for r in records:
        p = float(first_present(r, "power_consumption", "power") if first_present(r, "power_consumption", "power") is not None else 0)
        v = float(first_present(r, "voltage") if first_present(r, "voltage") is not None else 220)
        c = float(first_present(r, "current") if first_present(r, "current") is not None else 1)
        pf = p / (v * c) if v * c != 0 else 0.0
        rows.append([p, v, c, pf])

    return np.array(rows, dtype=float)


def train(
    records,
    contamination: float = 0.05,
    n_estimators: int = 150,
    random_state: int = 42,
    save_path: Path = DEFAULT_MODEL_PATH,
):
    """Build, fit and save the sklearn pipeline."""
    from sklearn.ensemble import IsolationForest
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    import joblib

    X = _build_feature_matrix(records)
    print(f"[train] Feature matrix shape: {X.shape}")

    pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler",  StandardScaler()),
        ("model",   IsolationForest(
            n_estimators=n_estimators,
            contamination=contamination,
            random_state=random_state,
            n_jobs=-1,
        )),
    ])

    t0 = time.monotonic()
    pipe.fit(X)
    elapsed = time.monotonic() - t0
    print(f"[train] Training complete in {elapsed:.1f}s")

    save_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipe, str(save_path))
    print(f"[train] Model saved → {save_path}")
    return pipe


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train Helios IsolationForest model")
    parser.add_argument(
        "--synthetic", type=int, metavar="N", default=0,
        help="Skip DB; generate N synthetic readings (default: 0 = try DB first)",
    )
    parser.add_argument(
        "--db-limit", type=int, default=20_000,
        help="Max readings to pull from DB (default: 20 000)",
    )
    parser.add_argument(
        "--contamination", type=float, default=0.05,
        help="Fraction of outliers in training data (default: 0.05)",
    )
    parser.add_argument(
        "--estimators", type=int, default=150,
        help="Number of IsolationForest trees (default: 150)",
    )
    parser.add_argument(
        "--out", type=Path, default=DEFAULT_MODEL_PATH,
        help=f"Output path for model (default: {DEFAULT_MODEL_PATH})",
    )
    args = parser.parse_args()

    _check_deps()

    if args.synthetic > 0:
        print(f"[train] Generating {args.synthetic} synthetic readings…")
        records = _generate_synthetic(args.synthetic)
    else:
        print("[train] Loading readings from database…")
        records = _load_from_db(limit=args.db_limit)
        if not records:
            fallback_n = 5_000
            print(f"[train] DB unavailable or empty — falling back to {fallback_n} synthetic readings.")
            records = _generate_synthetic(fallback_n)

    print(f"[train] Using {len(records)} records.")
    train(
        records,
        contamination=args.contamination,
        n_estimators=args.estimators,
        save_path=args.out,
    )


if __name__ == "__main__":
    main()
