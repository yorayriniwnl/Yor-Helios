import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "ml-engine" / "evaluation" / "evaluate.py"
SPEC = importlib.util.spec_from_file_location("helios_ml_evaluation", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_evaluation_is_reproducible_and_checks_temporal_split():
    first = MODULE.evaluate_synthetic(seed=7, meters=4, samples_per_meter=120)
    second = MODULE.evaluate_synthetic(seed=7, meters=4, samples_per_meter=120)
    assert first == second
    assert first["leakage_checks"]["train_test_sample_ids_disjoint"] is True
    assert first["leakage_checks"]["test_anomalies_after_train_boundary"] is True
    assert first["isolation_forest"]["calibration_status"] == "UNVERIFIED_SCORE_NOT_PROBABILITY"


def test_zero_values_are_preserved_by_feature_engineering():
    feature_path = ROOT / "ml-engine" / "training" / "feature_engineering.py"
    feature_spec = importlib.util.spec_from_file_location("helios_feature_engineering", feature_path)
    feature_module = importlib.util.module_from_spec(feature_spec)
    assert feature_spec and feature_spec.loader
    sys.modules[feature_spec.name] = feature_module
    feature_spec.loader.exec_module(feature_module)
    frame = feature_module.records_to_dataframe([{"timestamp": "2026-01-01T00:00:00Z", "power_consumption": 0, "voltage": 0, "current": 0}])
    assert float(frame.loc[0, "power_consumption"]) == 0.0
    assert float(frame.loc[0, "voltage"]) == 0.0
    assert float(frame.loc[0, "current"]) == 0.0
