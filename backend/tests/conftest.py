import os
import pytest

# Provide sensible defaults for tests before any app modules import DB/engine.
os.environ.setdefault("ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite:///./.pytest_temp_db.sqlite")
os.environ.setdefault("JWT_SECRET", "test_jwt_secret_1234567890_abcdef")

from backend.app.core.database import engine, Base  # noqa: E402


@pytest.fixture(autouse=True, scope="function")
def reset_db():
    """Recreate DB schema for each test to ensure isolation."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def db():
    from backend.app.core.database import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
