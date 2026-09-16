"""Logging configuration and request/error logging middleware.

Provides:
- ``configure_logging()``: configure root logger and uvicorn handlers with
  structured JSON output.
- ``RequestTracingMiddleware``: attach and propagate a `X-Request-ID` header
  for tracing.
- ``RequestLoggingMiddleware``: FastAPI/Starlette middleware that logs each
  request as structured JSON (includes request_id, path, latency, status)
  and logs exceptions to a separate error stream.

Use by importing and calling ``configure_logging()`` early in app startup and
adding ``RequestTracingMiddleware`` and ``RequestLoggingMiddleware`` to the
app middleware stack (tracing should be added before logging so the
`request_id` is available).
"""
from __future__ import annotations

import logging
import os
import sys
import time
import json
import uuid
import datetime
import re
from typing import Optional, Callable

try:
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import Response
except Exception:  # pragma: no cover - starlette should be available with FastAPI
    BaseHTTPMiddleware = object
    Request = object
    Response = object


# Header used to propagate the request id / trace id
REQUEST_ID_HEADER = "X-Request-ID"


class JSONFormatter(logging.Formatter):
    """Simple JSON formatter for structured logs.

    The formatter picks up commonly used attributes (request_id, path,
    method, status, latency_ms, client) when present on the LogRecord and
    emits a compact JSON object. Exceptions are serialized under the
    "exception" key.
    """

    def format(self, record: logging.LogRecord) -> str:  # pragma: no cover - formatting
        ts = None
        try:
            ts = datetime.datetime.fromtimestamp(record.created, timezone.utc).isoformat() + "Z"
        except Exception:
            ts = None

        log_record = {
            "timestamp": ts,
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Common structured fields we expect middleware to provide
        for key in ("request_id", "path", "method", "status", "latency_ms", "client"):
            if hasattr(record, key):
                try:
                    log_record[key] = getattr(record, key)
                except Exception:
                    log_record[key] = str(getattr(record, key))

        # Attach any other extras under `extra` to avoid accidental key
        # collisions with the top-level structure.
        extras = {}
        for k, v in record.__dict__.items():
            if k in ("name", "msg", "args", "levelname", "levelno", "pathname", "filename", "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName", "created", "msecs", "relativeCreated", "thread", "threadName", "processName", "process"):  # noqa: E501
                continue
            if k in ("request_id", "path", "method", "status", "latency_ms", "client"):
                continue
            if k.startswith("_"):
                continue
            extras[k] = v

        if extras:
            # Ensure extras are JSON-serializable when possible
            try:
                json.dumps(extras)
                log_record["extra"] = extras
            except Exception:
                # fallback to string representation
                log_record["extra"] = {k: str(v) for k, v in extras.items()}

        # Exception information
        if record.exc_info:
            try:
                log_record["exception"] = self.formatException(record.exc_info)
            except Exception:
                log_record["exception"] = str(record.exc_info)

        try:
            return json.dumps(log_record, ensure_ascii=False)
        except Exception:
            # As a last resort, return the plain message
            return super().format(record)


class MaxLevelFilter(logging.Filter):
    """Allow only records with levelno <= max_level."""

    def __init__(self, max_level: int):
        super().__init__()
        self.max_level = max_level

    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno <= self.max_level


class SensitiveAccessLogFilter(logging.Filter):
    """Redact bearer-like query parameters before Uvicorn access logging.

    The browser uses a WebSocket subprotocol for new connections, but this
    also protects compatibility clients that still send ``?token=...`` and
    prevents credentials from being persisted in ordinary request logs.
    """

    _sensitive_query = re.compile(r"([?&](?:token|access_token|authorization)=)[^&\s\"]+", re.IGNORECASE)

    def filter(self, record: logging.LogRecord) -> bool:
        if record.name.startswith("uvicorn"):
            rendered = record.getMessage()
            redacted = self._sensitive_query.sub(r"\1[REDACTED]", rendered)
            if redacted != rendered:
                record.msg = redacted
                record.args = ()
        return True


def configure_logging(level: Optional[str] = None) -> None:
    """Configure structured JSON logging for the application.

    - Creates two handlers: stdout (INFO..WARNING) and stderr (ERROR+).
    - Applies the JSON formatter to both and aligns Uvicorn loggers.
    """
    lvl = level or os.environ.get("LOG_LEVEL", "INFO")
    numeric_level = getattr(logging, lvl.upper(), logging.INFO)

    root = logging.getLogger()
    # Clear existing handlers to avoid duplicate log lines when reloading
    for h in list(root.handlers):
        root.removeHandler(h)

    root.setLevel(numeric_level)

    # Stdout handler for non-error logs (INFO, DEBUG, WARNING)
    out_handler = logging.StreamHandler(sys.stdout)
    out_handler.setLevel(logging.INFO)
    out_handler.addFilter(MaxLevelFilter(logging.WARNING))
    out_handler.addFilter(SensitiveAccessLogFilter())
    out_handler.setFormatter(JSONFormatter())

    # Stderr handler for errors and critical logs
    err_handler = logging.StreamHandler(sys.stderr)
    err_handler.setLevel(logging.ERROR)
    err_handler.addFilter(SensitiveAccessLogFilter())
    err_handler.setFormatter(JSONFormatter())

    root.addHandler(out_handler)
    root.addHandler(err_handler)

    # Keep Uvicorn logs consistent with our formatting/level
    for name in ("uvicorn.error", "uvicorn.access", "uvicorn"):
        logger = logging.getLogger(name)
        logger.handlers = root.handlers
        logger.propagate = False
        logger.setLevel(numeric_level)


def get_logger(name: Optional[str] = None) -> logging.Logger:
    return logging.getLogger(name)


class RequestTracingMiddleware(BaseHTTPMiddleware):
    """Attach a `X-Request-ID` to incoming requests and propagate it to
    responses. If a client provides `X-Request-ID` it will be honored.

    The middleware stores the request id on `request.state.request_id` and
    the request start time on `request.state.start_time` so other middleware
    can access it.
    """

    def __init__(self, app, header_name: str = REQUEST_ID_HEADER):
        super().__init__(app)
        self.header_name = header_name

    async def dispatch(self, request: "Request", call_next: Callable) -> "Response":
        # Prefer client-provided header, otherwise generate a new UUID4 hex
        rid = None
        try:
            rid = request.headers.get(self.header_name)
        except Exception:
            rid = None
        if not rid:
            rid = uuid.uuid4().hex

        # Attach to request state for downstream middleware/handlers
        try:
            request.state.request_id = rid
            request.state.start_time = time.time()
        except Exception:
            pass

        response = await call_next(request)
        try:
            response.headers[self.header_name] = rid
        except Exception:
            pass
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that emits structured JSON logs for each request.

    Emits an INFO-level log with fields: ``request_id``, ``method``,
    ``path``, ``status``, ``latency_ms``, ``client``. Unhandled exceptions are
    logged to the error stream with `logger.exception` so the exception
    payload (stacktrace) is captured under the ``exception`` key.
    """

    def __init__(self, app, logger_name: str = "helios.request"):
        super().__init__(app)
        self.logger = get_logger(logger_name)
        self.error_logger = get_logger("helios.error")

    async def dispatch(self, request: "Request", call_next: Callable) -> "Response":
        # Use any start_time set by tracing middleware; otherwise use now
        start = getattr(request.state, "start_time", None) or time.time()
        try:
            client = request.client.host if getattr(request, "client", None) else None
        except Exception:
            client = None

        # Ensure we have a request id (tracing middleware normally sets this)
        req_id = getattr(request.state, "request_id", None) or request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        try:
            request.state.request_id = req_id
        except Exception:
            pass

        try:
            response = await call_next(request)
            elapsed_ms = (time.time() - start) * 1000
            status_code = getattr(response, "status_code", None)

            self.logger.info(
                "request_completed",
                extra={
                    "request_id": req_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": status_code,
                    "latency_ms": round(elapsed_ms, 2),
                    "client": client,
                },
            )

            # Propagate request id header if for some reason tracing middleware
            # didn't set it earlier (best-effort)
            try:
                response.headers[REQUEST_ID_HEADER] = req_id
            except Exception:
                pass

            return response
        except Exception:  # pragma: no cover - runtime exception paths
            elapsed_ms = (time.time() - start) * 1000
            # Log full exception details to error logger (structured)
            self.error_logger.exception(
                "unhandled_exception",
                extra={
                    "request_id": req_id,
                    "method": request.method,
                    "path": getattr(request.url, "path", None),
                    "latency_ms": round(elapsed_ms, 2),
                    "client": client,
                },
            )
            raise
