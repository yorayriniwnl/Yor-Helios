import pytest
from fastapi import HTTPException

from backend.app.api.v1.routes.alerts import _validate_evidence_upload


@pytest.mark.parametrize(
    ("content_type", "filename", "contents"),
    [
        ("image/jpeg", "inspection.jpg", b"\xff\xd8\xff\xe0synthetic-jpeg"),
        ("image/png", "inspection.png", b"\x89PNG\r\n\x1a\nsynthetic-png"),
        ("image/webp", "inspection.webp", b"RIFF0000WEBPsynthetic-webp"),
        ("application/pdf", "inspection.pdf", b"%PDF-1.7\nsynthetic-pdf"),
    ],
)
def test_evidence_upload_accepts_matching_signatures(content_type, filename, contents):
    _validate_evidence_upload(content_type, filename, contents)


@pytest.mark.parametrize(
    ("content_type", "filename", "contents"),
    [
        ("image/png", "inspection.png", b"MZnot-a-png"),
        ("image/png", "inspection.jpg", b"\x89PNG\r\n\x1a\nnot-a-jpeg"),
        ("application/pdf", "inspection.pdf", b"not-a-pdf"),
    ],
)
def test_evidence_upload_rejects_spoofed_type_or_signature(content_type, filename, contents):
    with pytest.raises(HTTPException) as exc_info:
        _validate_evidence_upload(content_type, filename, contents)
    assert exc_info.value.status_code == 415
