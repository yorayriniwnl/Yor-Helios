"""SQLAlchemy engine, session and base setup."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from typing import Generator
from sqlalchemy import event
import time
import logging
import os

# Import settings (support absolute or relative import depending on execution)
try:
    from backend.app.core.config import settings
except Exception:
    from .config import settings

# Allow an explicit environment override so test modules that set
# `DATABASE_URL` before imports can control the engine target.
DATABASE_URL = os.environ.get("DATABASE_URL") or settings.DATABASE_URL

_engine_kwargs = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, **_engine_kwargs)
else:
    engine = create_engine(DATABASE_URL, **_engine_kwargs)


# Simple slow-query profiler: logs queries slower than SLOW_QUERY_MS (ms)
SLOW_QUERY_MS = int(os.environ.get("SLOW_QUERY_MS", "100"))


@event.listens_for(engine, "before_cursor_execute")
def _query_start(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault("query_start_time", []).append(time.time())


@event.listens_for(engine, "after_cursor_execute")
def _query_end(conn, cursor, statement, parameters, context, executemany):
    try:
        start = conn.info.get("query_start_time", []).pop(-1)
    except Exception:
        start = None
    if start:
        total_ms = (time.time() - start) * 1000.0
        if total_ms >= SLOW_QUERY_MS:
            logger = logging.getLogger("helios.db")
            # Do not log parameter values to avoid leaking sensitive data
            logger.warning(f"Slow query: {total_ms:.1f}ms — {statement}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Import the model registry so SQLAlchemy knows about all tables/relationships
# before metadata creation or mapper configuration happens.
try:
    from backend.app import models as _models  # noqa: F401
except Exception:
    try:
        from .. import models as _models  # noqa: F401
    except Exception:
        _models = None


def get_db() -> Generator:
    """Yield a database session, ensure it's closed afterwards."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        # A failed flush/commit leaves the session transaction poisoned. Roll
        # it back before the session is returned to the pool so one request
        # cannot contaminate the next request handled by this process.
        db.rollback()
        raise
    finally:
        db.close()
