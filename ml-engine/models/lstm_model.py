"""Lightweight LSTM forecasting model (hackathon-ready).

Provides a minimal PyTorch-based LSTM sequence model with `train()` and
`predict()` helpers. The model expects sliding windows of historical
`power_consumption` values and predicts the next value.

This module is intentionally lightweight: it falls back with informative
errors when PyTorch / numpy are not installed and includes a simple DB
loader that builds sequences from `backend.app.models.reading.Reading`
when training data arrays are not supplied directly.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Optional, Sequence, Tuple, Union

try:
    import numpy as np
except Exception:  # pragma: no cover - runtime dependency
    np = None  # type: ignore

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import DataLoader, TensorDataset
except Exception:  # pragma: no cover - runtime dependency
    torch = None  # type: ignore
    nn = None  # type: ignore
    optim = None  # type: ignore
    DataLoader = None  # type: ignore
    TensorDataset = None  # type: ignore

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_DIR = ROOT / "saved_models"
DEFAULT_MODEL_PATH = DEFAULT_MODEL_DIR / "lstm_model.pt"


def _ensure_model_dir(path: Path) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass


class LSTMForecast(nn.Module):
    def __init__(self, input_size: int = 1, hidden_size: int = 32, num_layers: int = 1, dropout: float = 0.0):
        super().__init__()
        self.lstm = nn.LSTM(input_size=input_size, hidden_size=hidden_size, num_layers=num_layers, batch_first=True, dropout=dropout if num_layers > 1 else 0.0)
        self.fc = nn.Linear(hidden_size, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, input_size)
        out, (hn, cn) = self.lstm(x)
        h_last = hn[-1]
        out = self.fc(h_last)
        return out.squeeze(-1)


def _prepare_sequences_from_records(records: Sequence[Any], window_size: int = 24) -> Tuple[np.ndarray, np.ndarray]:
    if np is None:
        raise RuntimeError("numpy is required to prepare training sequences")

    from collections import defaultdict

    groups = defaultdict(list)
    for r in records:
        try:
            meter_id = getattr(r, "meter_id", None)
            ts = getattr(r, "timestamp", None)
            power = getattr(r, "power_consumption", None)
            if power is None:
                power = getattr(r, "power", None)
            if power is None:
                continue
            groups[meter_id].append((ts, float(power)))
        except Exception:
            continue

    X_list = []
    y_list = []
    for _, seq in groups.items():
        seq.sort(key=lambda t: t[0] if t[0] is not None else 0)
        vals = [v for _, v in seq]
        if len(vals) <= window_size:
            continue
        for i in range(len(vals) - window_size):
            X_list.append(vals[i : i + window_size])
            y_list.append(vals[i + window_size])

    if not X_list:
        raise RuntimeError("Not enough data to build sequences (window_size=%d)" % window_size)

    X = np.array(X_list, dtype=float)
    if X.ndim == 2:
        X = X.reshape((X.shape[0], X.shape[1], 1))
    y = np.array(y_list, dtype=float).reshape(-1, 1)
    return X, y


def _load_data_from_db(window_size: int = 24, sample_limit: Optional[int] = None):
    try:
        try:
            from backend.app.core.database import SessionLocal
            from backend.app.models.reading import Reading
        except Exception:
            from ..backend.app.core.database import SessionLocal  # type: ignore
            from ..backend.app.models.reading import Reading  # type: ignore
    except Exception as exc:
        raise RuntimeError("Could not import backend DB to load training data: %s" % exc)

    session = SessionLocal()
    try:
        q = session.query(Reading).order_by(Reading.meter_id, Reading.timestamp)
        if sample_limit:
            q = q.limit(sample_limit)
        records = q.all()
    finally:
        try:
            session.close()
        except Exception:
            pass

    return _prepare_sequences_from_records(records, window_size=window_size)


def train(
    X: Optional[np.ndarray] = None,
    y: Optional[np.ndarray] = None,
    window_size: int = 24,
    sample_limit: Optional[int] = None,
    epochs: int = 5,
    batch_size: int = 64,
    lr: float = 1e-3,
    hidden_size: int = 32,
    num_layers: int = 1,
    save_path: Optional[Union[str, Path]] = None,
    device: Optional[str] = None,
) -> Optional[Path]:
    """Train a small LSTM on sliding windows.

    Either pass `X` and `y` directly (numpy arrays) or allow the function to
    pull readings from the backend DB and build sequences automatically.
    """
    if torch is None or np is None:
        raise RuntimeError("PyTorch and numpy are required to train the LSTM model")

    if X is None or y is None:
        X, y = _load_data_from_db(window_size=window_size, sample_limit=sample_limit)

    # Normalize shapes
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float).reshape(-1, 1)
    if X.ndim == 2:
        X = X.reshape((X.shape[0], X.shape[1], 1))

    input_size = X.shape[2]

    # Build dataloader
    X_t = torch.tensor(X, dtype=torch.float32)
    y_t = torch.tensor(y, dtype=torch.float32).view(-1)
    dataset = TensorDataset(X_t, y_t)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    # Device
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    model = LSTMForecast(input_size=input_size, hidden_size=hidden_size, num_layers=num_layers)
    model.to(device)

    opt = optim.Adam(model.parameters(), lr=lr)
    criterion = nn.MSELoss()

    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        for bx, by in loader:
            bx = bx.to(device)
            by = by.to(device)
            opt.zero_grad()
            preds = model(bx)
            loss = criterion(preds, by)
            loss.backward()
            opt.step()
            total_loss += loss.item() * bx.size(0)
        avg = total_loss / len(dataset)
        print(f"Epoch {epoch}/{epochs} - loss: {avg:.6f}")

    target = Path(save_path) if save_path else DEFAULT_MODEL_PATH
    _ensure_model_dir(target)
    try:
        torch.save({
            "state_dict": model.state_dict(),
            "input_size": input_size,
            "hidden_size": hidden_size,
            "num_layers": num_layers,
        }, str(target))
    except Exception as exc:
        raise RuntimeError(f"Failed to save model to {target}: {exc}")

    return target


def _load_saved_model(model_path: Optional[Union[str, Path]] = None, device: Optional[str] = None) -> nn.Module:
    if torch is None:
        raise RuntimeError("PyTorch is required to load LSTM model")
    path = Path(model_path) if model_path else DEFAULT_MODEL_PATH
    if not path.exists():
        raise RuntimeError(f"Model file not found: {path}")
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    data = torch.load(str(path), map_location=device)
    state = data.get("state_dict") if isinstance(data, dict) and "state_dict" in data else data
    input_size = int(data.get("input_size", 1) if isinstance(data, dict) else 1)
    hidden_size = int(data.get("hidden_size", 32) if isinstance(data, dict) else 32)
    num_layers = int(data.get("num_layers", 1) if isinstance(data, dict) else 1)
    model = LSTMForecast(input_size=input_size, hidden_size=hidden_size, num_layers=num_layers)
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return model


def predict(
    sequence: Union[Sequence[float], Sequence[Sequence[float]], np.ndarray],
    model_path: Optional[Union[str, Path]] = None,
    model: Optional[Any] = None,
    device: Optional[str] = None,
) -> float:
    """Predict next value given a single time-series window.

    `sequence` may be a 1D list/array (seq_len,) or a 2D array where the inner
    dimension corresponds to features. For common usage with single-feature
    power readings, pass a 1D sequence of length `window_size`.
    """
    if torch is None or np is None:
        raise RuntimeError("PyTorch and numpy are required for prediction")

    if model is None:
        model = _load_saved_model(model_path=model_path, device=device)

    arr = np.asarray(sequence, dtype=float)
    if arr.ndim == 1:
        arr = arr.reshape(1, arr.shape[0], 1)
    elif arr.ndim == 2:
        arr = arr.reshape(1, arr.shape[0], arr.shape[1])

    tensor = torch.tensor(arr, dtype=torch.float32)
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    tensor = tensor.to(device)
    model = model.to(device)
    model.eval()
    with torch.no_grad():
        out = model(tensor)
    # out is shape (1,) or (batch,)
    val = float(out.cpu().numpy().reshape(-1)[0])
    return val


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Train a small LSTM to forecast next consumption value.")
    p.add_argument("--out", default=str(DEFAULT_MODEL_PATH), help="Output model path")
    p.add_argument("--window", type=int, default=24, help="Sliding window size (samples)")
    p.add_argument("--epochs", type=int, default=5)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--limit", type=int, default=0, help="Limit number of DB rows to use (0 = no limit)")
    args = p.parse_args()

    lim = args.limit if args.limit and args.limit > 0 else None
    print("Training lightweight LSTM...")
    out = train(window_size=args.window, sample_limit=lim, epochs=args.epochs, batch_size=args.batch_size, lr=args.lr, save_path=Path(args.out))
    print("Saved model to", out)
