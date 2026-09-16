"""Evidence service: handle file writes and create evidence records."""
from typing import Optional
from sqlalchemy.orm import Session
from pathlib import Path

try:
    from backend.app.repositories.evidence_repository import create_evidence as repo_create_evidence
except Exception:
    from ..repositories.evidence_repository import create_evidence as repo_create_evidence


STORAGE_DIR = Path(__file__).resolve().parents[3] / "media" / "evidence"


def _ensure_storage():
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def save_file_and_create_record(db: Session, alert_id: int, file_bytes: bytes, filename: str, user_id: Optional[int] = None, gps_lat: Optional[float] = None, gps_lon: Optional[float] = None, evidence_ts: Optional[str] = None, notes: Optional[str] = None, before_after: Optional[str] = None):
    """Save uploaded file to disk and create evidence DB record.

    Returns the created Evidence object (from repository).
    """
    _ensure_storage()

    # Store a generated name under the fixed storage root. The original name
    # remains metadata only and can never influence the filesystem path.
    import re
    import uuid

    original_name = Path(filename or "upload").name.replace("\x00", "")[:255] or "upload"
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", original_name)
    out_path = (STORAGE_DIR / f"{uuid.uuid4().hex}_{safe_name}").resolve()
    storage_root = STORAGE_DIR.resolve()
    if storage_root not in out_path.parents:
        raise RuntimeError("Invalid evidence storage path")

    try:
        out_path.write_bytes(file_bytes)
        rec = repo_create_evidence(
            db,
            alert_id=alert_id,
            user_id=user_id,
            file_path=str(out_path),
            original_filename=original_name,
            gps_lat=gps_lat,
            gps_lon=gps_lon,
            evidence_ts=evidence_ts,
            notes=notes,
            before_after=before_after,
        )
        return rec
    except Exception:
        try:
            out_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise
