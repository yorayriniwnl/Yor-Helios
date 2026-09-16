"""Simple rate-limiting middleware.

Limits requests per client IP using an in-memory sliding window.
This is a best-effort, per-process implementation (suitable for single-instance
or development). For multi-process production, use a centralized store
like Redis and an atomic counter instead.
"""
import time
import asyncio
from collections import defaultdict, deque
from typing import DefaultDict, Deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

try:
    from backend.app.core.config import settings
except Exception:
    from ..core.config import settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_requests: int = 100, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = int(max_requests)
        self.window_seconds = int(window_seconds)
        # maps ip -> deque[timestamp]
        self._requests: DefaultDict[str, Deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def dispatch(self, request, call_next):
        # Only trust forwarding headers when the deployment explicitly sits
        # behind a trusted proxy. Otherwise clients can spoof their identity
        # and bypass the limiter by rotating X-Forwarded-For values.
        try:
            xff = request.headers.get("x-forwarded-for") if getattr(settings, "TRUST_PROXY", False) else None
            if xff:
                ip = xff.split(",")[0].strip()
            else:
                client = request.client
                ip = client.host if client is not None else "unknown"
        except Exception:
            ip = "unknown"

        now = time.time()
        cutoff = now - self.window_seconds

        async with self._lock:
            dq = self._requests[ip]
            # remove old timestamps
            while dq and dq[0] <= cutoff:
                dq.popleft()

            if len(dq) >= self.max_requests:
                # Too many requests
                retry_after = int((dq[0] + self.window_seconds) - now) if dq else self.window_seconds
                headers = {"Retry-After": str(retry_after)}
                return JSONResponse({"detail": "Too Many Requests"}, status_code=429, headers=headers)

            dq.append(now)

        response = await call_next(request)
        return response
