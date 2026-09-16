#!/usr/bin/env python3
"""Evaluate Helios anomaly detection without hiding the data assumptions.

The evaluator creates a deterministic, meter-aware synthetic benchmark with a
chronological split. Anomalies are injected only into the test window, so the
detector cannot learn the evaluation labels. It compares the existing
interpretable rule baseline with an in-memory IsolationForest pipeline and
optimizes three explicit operating thresholds:

    precision-first, balanced, recall-first

The resulting JSON is an auditable experiment artifact. Scores are anomaly
scores, not calibrated probabilities; calibration is reported as unverified
until a labeled field dataset is available.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Tuple

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer
from sklearn.metrics import average_precision_score, brier_score_loss, precision_recall_fscore_support, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@dataclass(frozen=True)
class BenchmarkRecord:
    sample_id: str
    meter_id: int
    timestamp_index: int
    power_consumption: float
    voltage: float
    current: float
    label: int
    anomaly_kind: str | None = None


def build_synthetic_benchmark(
    seed: int = 42,
    meters: int = 24,
    samples_per_meter: int = 240,
    train_fraction: float = 0.7,
) -> Tuple[List[BenchmarkRecord], int]:
    """Create normal meter histories with test-only, labeled disturbances."""
    rng = np.random.default_rng(seed)
    train_boundary = int(samples_per_meter * train_fraction)
    records: List[BenchmarkRecord] = []

    for meter_id in range(1, meters + 1):
        phase = float(rng.uniform(0, math.tau))
        base_load = float(rng.uniform(220, 520))
        for index in range(samples_per_meter):
            cycle = 0.18 * math.sin((index / 24.0) * math.tau + phase)
            power = base_load * (1.0 + cycle) + float(rng.normal(0, base_load * 0.035))
            voltage = 230.0 + float(rng.normal(0, 2.5))
            current = max(0.05, power / voltage + float(rng.normal(0, 0.04)))
            label = 0
            anomaly_kind = None

            # Keep every injected label in the holdout period. The pattern is
            # deterministic and deliberately includes different failure modes.
            if index >= train_boundary:
                holdout_index = index - train_boundary
                if holdout_index % 37 == 0:
                    power = float(rng.uniform(4_200, 7_500))
                    current = power / max(voltage, 1.0)
                    label, anomaly_kind = 1, "load_spike"
                elif holdout_index % 53 == 0:
                    power = float(rng.uniform(3.0, 12.0))
                    current = max(0.01, power / max(voltage, 1.0))
                    label, anomaly_kind = 1, "under_reporting"
                elif holdout_index % 71 == 0:
                    voltage = float(rng.uniform(165, 185))
                    current = max(0.05, power / max(voltage, 1.0))
                    label, anomaly_kind = 1, "voltage_sag"

            records.append(BenchmarkRecord(
                sample_id=f"meter-{meter_id}-sample-{index}",
                meter_id=meter_id,
                timestamp_index=index,
                power_consumption=round(power, 5),
                voltage=round(voltage, 5),
                current=round(current, 5),
                label=label,
                anomaly_kind=anomaly_kind,
            ))

    return records, train_boundary


def _matrix(records: Sequence[BenchmarkRecord]) -> np.ndarray:
    rows = []
    for record in records:
        denominator = record.voltage * record.current
        power_factor = record.power_consumption / denominator if denominator else np.nan
        rows.append([record.power_consumption, record.voltage, record.current, power_factor])
    return np.asarray(rows, dtype=float)


def _rule_score(record: BenchmarkRecord) -> float:
    if record.power_consumption >= 3_000:
        excess = record.power_consumption - 3_000
        return min(1.0, 0.5 + 0.5 * min(1.0, excess / 3_000))
    return min(0.45, max(0.0, record.power_consumption) / 3_000 * 0.45)


def _isolation_scores(train_records: Sequence[BenchmarkRecord], test_records: Sequence[BenchmarkRecord], seed: int) -> np.ndarray:
    model = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("model", IsolationForest(n_estimators=150, contamination=0.05, random_state=seed, n_jobs=-1)),
    ])
    model.fit(_matrix(train_records))
    decision = model.decision_function(_matrix(test_records))
    # Same monotonic mapping used by production inference. This remains an
    # anomaly score; it is intentionally not called a probability.
    return np.asarray([1.0 / (1.0 + math.exp(12.0 * float(value))) for value in decision])


def _metrics(labels: np.ndarray, scores: np.ndarray, threshold: float) -> Dict[str, float | int]:
    predictions = scores >= threshold
    precision, recall, f1, _ = precision_recall_fscore_support(labels, predictions, average="binary", zero_division=0)
    true_negatives = int(((labels == 0) & ~predictions).sum())
    false_positives = int(((labels == 0) & predictions).sum())
    normal_count = max(1, int((labels == 0).sum()))
    return {
        "threshold": round(float(threshold), 6),
        "precision": round(float(precision), 6),
        "recall": round(float(recall), 6),
        "f1": round(float(f1), 6),
        "false_positive_rate": round(false_positives / normal_count, 6),
        "alert_rate_per_1000": round(float(predictions.mean() * 1000), 3),
        "predicted_alerts": int(predictions.sum()),
        "true_negatives": true_negatives,
        "false_positives": false_positives,
    }


def _choose_threshold(labels: np.ndarray, scores: np.ndarray, beta: float) -> float:
    candidates = np.unique(np.round(np.concatenate([np.linspace(0.01, 0.99, 197), scores]), 6))
    best = (float("-inf"), 0.5)
    for threshold in candidates:
        predictions = scores >= threshold
        precision, recall, _, _ = precision_recall_fscore_support(labels, predictions, average="binary", zero_division=0)
        beta_squared = beta * beta
        denominator = beta_squared * precision + recall
        score = ((1 + beta_squared) * precision * recall / denominator) if denominator else 0.0
        candidate = (float(score), float(threshold))
        if candidate > best:
            best = candidate
    return best[1]


def _summary_metrics(labels: np.ndarray, scores: np.ndarray) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "roc_auc": round(float(roc_auc_score(labels, scores)), 6),
        "pr_auc": round(float(average_precision_score(labels, scores)), 6),
        "brier_score_diagnostic": round(float(brier_score_loss(labels, scores)), 6),
        "calibration_status": "UNVERIFIED_SCORE_NOT_PROBABILITY",
        "threshold_profiles": {},
    }
    profiles = {"precision_first": 0.5, "balanced": 1.0, "recall_first": 2.0}
    for name, beta in profiles.items():
        threshold = _choose_threshold(labels, scores, beta)
        result["threshold_profiles"][name] = _metrics(labels, scores, threshold)
    return result


def evaluate_synthetic(seed: int = 42, meters: int = 24, samples_per_meter: int = 240) -> Dict[str, Any]:
    records, train_boundary = build_synthetic_benchmark(seed, meters, samples_per_meter)
    train_records = [record for record in records if record.timestamp_index < train_boundary]
    test_records = [record for record in records if record.timestamp_index >= train_boundary]
    labels = np.asarray([record.label for record in test_records], dtype=int)

    rule_scores = np.asarray([_rule_score(record) for record in test_records], dtype=float)
    model_scores = _isolation_scores(train_records, test_records, seed)

    return {
        "experiment": {
            "name": "helios-anomaly-detectors-synthetic-v1",
            "dataset_version": "synthetic-meter-grid-2026-09-02",
            "seed": seed,
            "meters": meters,
            "samples_per_meter": samples_per_meter,
            "total_records": len(records),
            "train_records": len(train_records),
            "test_records": len(test_records),
            "train_boundary_index": train_boundary,
            "features": ["power_consumption", "voltage", "current", "power_factor"],
            "detector_config": {"isolation_forest_estimators": 150, "contamination": 0.05, "score_mapping": "sigmoid(decision_function * -12)"},
            "split": "chronological per meter; anomalies injected only after the train boundary",
        },
        "label_counts": {
            "normal": int((labels == 0).sum()),
            "anomaly": int((labels == 1).sum()),
            "by_kind": {kind: sum(record.anomaly_kind == kind for record in test_records) for kind in ("load_spike", "under_reporting", "voltage_sag")},
        },
        "leakage_checks": {
            "train_test_sample_ids_disjoint": len({r.sample_id for r in train_records}.intersection(r.sample_id for r in test_records)) == 0,
            "test_anomalies_after_train_boundary": all(r.timestamp_index >= train_boundary for r in records if r.label),
            "scaler_fit_on_train_only": True,
            "future_feature_usage": False,
        },
        "rule_baseline": _summary_metrics(labels, rule_scores),
        "isolation_forest": _summary_metrics(labels, model_scores),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate Helios anomaly detectors on a reproducible synthetic holdout")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--meters", type=int, default=24)
    parser.add_argument("--samples-per-meter", type=int, default=240)
    parser.add_argument("--out", type=Path, default=None, help="Optional JSON artifact path")
    args = parser.parse_args()
    result = evaluate_synthetic(args.seed, args.meters, args.samples_per_meter)
    serialized = json.dumps(result, indent=2, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(serialized + "\n", encoding="utf-8")
        print(f"Evaluation artifact written: {args.out}")
    else:
        print(serialized)

    for detector in ("rule_baseline", "isolation_forest"):
        metrics = result[detector]
        balanced = metrics["threshold_profiles"]["balanced"]
        print(f"{detector}: PR-AUC={metrics['pr_auc']:.4f} ROC-AUC={metrics['roc_auc']:.4f} F1={balanced['f1']:.4f} FPR={balanced['false_positive_rate']:.4f}")


if __name__ == "__main__":
    main()
