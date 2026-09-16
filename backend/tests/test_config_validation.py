from types import SimpleNamespace

import pytest

from backend.app.core.config import _validate_settings


def _production_settings(jwt_secret: str):
    return SimpleNamespace(
        ENV="production",
        DATABASE_URL="postgresql://helios:password@postgres:5432/helios",
        JWT_SECRET=jwt_secret,
        CORS_ALLOWED_ORIGINS=["https://app.example.com"],
        REDIS_URL="redis://redis:6379/0",
    )


@pytest.mark.parametrize(
    "jwt_secret",
    [
        "dev_jwt_secret_change_me",
        "local_dev_jwt_secret_change_me_use_env_in_production",
    ],
)
def test_production_rejects_known_development_jwt_secrets(jwt_secret):
    with pytest.raises(SystemExit):
        _validate_settings(_production_settings(jwt_secret))


def test_production_accepts_explicit_strong_jwt_secret():
    _validate_settings(_production_settings("a" * 64))
