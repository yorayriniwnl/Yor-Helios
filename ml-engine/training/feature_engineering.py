"""Feature engineering for Helios ML pipeline.

Generates additional features from raw meter readings to improve model
performance. Exposes a simple API to convert a sequence of reading records
into a numeric feature matrix suitable for scikit-learn pipelines.

Features produced:
- rolling_mean: rolling mean of `power_consumption` over `window` samples
- rolling_std: rolling std of `power_consumption` over `window` samples
- consumption_delta: difference from previous reading
- night_usage_ratio: ratio of consumption in night hours within a time window

The functions accept SQLAlchemy model instances or dict-like records.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable, List, Optional, Sequence

try:
    import numpy as np
    import pandas as pd
except Exception:  # pragma: no cover - runtime dependency
    np = None  # type: ignore
    pd = None  # type: ignore


def _extract_from_record(rec: Any) -> dict:
    def first_present(source: Any, *keys: str):
        for key in keys:
            value = source.get(key) if isinstance(source, dict) else getattr(source, key, None)
            if value is not None:
                return value
        return None

    if rec is None:
        return {"timestamp": None, "power_consumption": None, "voltage": None, "current": None}
    ts = first_present(rec, "timestamp", "time")
    p = first_present(rec, "power_consumption", "power", "consumption")
    v = first_present(rec, "voltage")
    c = first_present(rec, "current")
    return {"timestamp": ts, "power_consumption": p, "voltage": v, "current": c}


def records_to_dataframe(records: Sequence[Any]) -> "pd.DataFrame":
    """Convert a sequence of records into a cleaned pandas DataFrame.

    The returned DataFrame is sorted by `timestamp` and includes a computed
    `power_factor` column.
    """
    if pd is None or np is None:  # pragma: no cover - runtime dependency
        raise RuntimeError("pandas and numpy are required for feature engineering")

    rows: List[dict] = []
    for r in records:
        rows.append(_extract_from_record(r))

    df = pd.DataFrame(rows)
    if df.empty:
        # return an empty but well-formed DataFrame
        cols = ["timestamp", "power_consumption", "voltage", "current", "power_factor"]
        return pd.DataFrame(columns=cols)

    # Normalize timestamp
    try:
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    except Exception:
        # If conversion fails, leave as-is (some use-cases pass datetime already)
        pass

    # Ensure numeric types
    for c in ("power_consumption", "voltage", "current"):
        df[c] = pd.to_numeric(df[c], errors="coerce")

    # Compute power factor when possible
    def _compute_pf(row):
        p = row.get("power_consumption")
        v = row.get("voltage")
        c = row.get("current")
        try:
            if p is None or v is None or c is None:
                return np.nan
            denom = float(v) * float(c)
            if denom == 0:
                return np.nan
            return float(p) / denom
        except Exception:
            return np.nan

    df["power_factor"] = df.apply(_compute_pf, axis=1)

    # Sort
    if "timestamp" in df.columns:
        df = df.sort_values("timestamp").reset_index(drop=True)

    return df


def records_to_feature_matrix(
    records: Sequence[Any],
    window: int = 5,
    time_window_hours: int = 24,
    night_hours: Optional[Sequence[int]] = None,
) -> "np.ndarray":
    """Produce a numeric feature matrix from raw readings.

    Parameters:
    - records: sequence of dict-like objects or model instances
    - window: rolling window (in samples) for mean/std
    - time_window_hours: lookback window used for night usage ratio
    - night_hours: sequence of hour integers considered 'night' (0-23)

    Returns:
    - numpy.ndarray of shape (n_samples, n_features)
      Features order: power_consumption, voltage, current, power_factor,
      rolling_mean, rolling_std, consumption_delta, night_usage_ratio
    """
    if pd is None or np is None:  # pragma: no cover - runtime dependency
        raise RuntimeError("pandas and numpy are required for feature engineering")

    if night_hours is None:
        night_hours = list(range(0, 6))  # midnight -> 5am as night

    df = records_to_dataframe(records)
    if df.empty:
        return np.zeros((0, 8), dtype=float)

    # Rolling stats on power_consumption
    df["rolling_mean"] = df["power_consumption"].rolling(window=window, min_periods=1).mean()
    df["rolling_std"] = df["power_consumption"].rolling(window=window, min_periods=1).std().fillna(0.0)

    # Consumption delta
    df["consumption_delta"] = df["power_consumption"].diff().fillna(0.0)

    # Night usage ratio: for each row, compute fraction of consumption in night hours
    # within the trailing `time_window_hours` hours. This is O(n^2) in worst case
    # for irregular timestamps but is simple and robust for moderate dataset sizes.
    night_ratios: List[float] = []
    if "timestamp" in df.columns and not df["timestamp"].isna().all():
        for ts in df["timestamp"]:
            if pd.isna(ts):
                night_ratios.append(0.0)
                continue
            start = ts - pd.Timedelta(hours=time_window_hours)
            mask = (df["timestamp"] >= start) & (df["timestamp"] <= ts)
            window_df = df.loc[mask]
            total = window_df["power_consumption"].fillna(0.0).sum()
            if total <= 0:
                night_ratios.append(0.0)
                continue
            night_sum = window_df.loc[window_df["timestamp"].dt.hour.isin(night_hours), "power_consumption"].fillna(0.0).sum()
            night_ratios.append(float(night_sum) / float(total))
    else:
        # Fallback: no timestamps, use last `window` samples to estimate night ratio as 0
        night_ratios = [0.0] * len(df)

    df["night_usage_ratio"] = night_ratios

    features = [
        "power_consumption",
        "voltage",
        "current",
        "power_factor",
        "rolling_mean",
        "rolling_std",
        "consumption_delta",
        "night_usage_ratio",
    ]

    # Ensure all feature columns exist
    for f in features:
        if f not in df.columns:
            df[f] = np.nan

    X = df[features].to_numpy(dtype=float)
    return X


__all__ = ["records_to_dataframe", "records_to_feature_matrix"]
