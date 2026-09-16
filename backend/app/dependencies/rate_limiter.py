"""Per-route rate limiter dependencies.

Provides simple Redis-backed counters with an in-memory fallback for
single-process deployments. Exported dependencies can be used with
`Depends()` in route signatures.
"""
from __future__ import annotations

import time
import asyncio
from collections import defaultdict, deque
from typing import DefaultDict, Deque, Optional

from fastapi import HTTPException
from starlette.requests import Request

from backend.app.core.cache import _init_client
from backend.app.core.config import settings

# In-memory fallback storage: maps key -> deque[timestamp]
_in_memory: DefaultDict[str, Deque[float]] = defaultdict(deque)
_in_memory_lock = asyncio.Lock()


def _client_ip(request: Request) -> str:
    try:
        xff = request.headers.get("x-forwarded-for") if getattr(settings, "TRUST_PROXY", False) else None
        if xff:
            return xff.split(",")[0].strip()
        client = request.client
        return client.host if client is not None else "unknown"
    except Exception:
        return "unknown"


async def _in_memory_check(key: str, limit: int, window_seconds: int) -> Optional[int]:
    """Return None if allowed, otherwise retry_after seconds."""
    now = time.time()
    cutoff = now - window_seconds
    async with _in_memory_lock:
        dq = _in_memory[key]
        while dq and dq[0] <= cutoff:
            dq.popleft()
        if len(dq) >= limit:
            retry_after = int((dq[0] + window_seconds) - now) if dq else window_seconds
            return max(1, retry_after)
        dq.append(now)
    return None


def _redis_check(client, key: str, limit: int, window_seconds: int) -> Optional[int]:
    """Use Redis INCR with expiry. Return None if allowed, otherwise
    retry_after seconds.
    """
    try:
        # atomic increment
        current = client.incr(key)
        if current == 1:
            client.expire(key, window_seconds)
        if current > limit:
            ttl = client.ttl(key)
            if ttl is None or ttl < 0:
                retry = window_seconds
            else:
                retry = int(ttl)
            return max(1, retry)
        return None
    except Exception:
        return None


async def login_rate_limit(request: Request):
    """Limit login attempts per client IP.

    Defaults: 5 attempts per 60 seconds.
    Raises HTTPException(429) when the limit is exceeded.
    """
    ip = _client_ip(request)
    key = f"rl:login:{ip}"
    limit = 5
    window = 60

    client = _init_client()
    if client is not None:
        retry = _redis_check(client, key, limit, window)
        if retry:
            raise HTTPException(status_code=429, detail="Too Many Requests", headers={"Retry-After": str(retry)})
        return

    # fallback to in-memory
    retry = await _in_memory_check(key, limit, window)
    if retry:
        raise HTTPException(status_code=429, detail="Too Many Requests", headers={"Retry-After": str(retry)})


async def refresh_rate_limit(request: Request):
    """Limit refresh-token rotation attempts per client IP."""
    ip = _client_ip(request)
    key = f"rl:refresh:{ip}"
    limit = 20
    window = 60

    client = _init_client()
    if client is not None:
        retry = _redis_check(client, key, limit, window)
        if retry:
            raise HTTPException(status_code=429, detail="Too Many Requests", headers={"Retry-After": str(retry)})
        return

    retry = await _in_memory_check(key, limit, window)
    if retry:
        raise HTTPException(status_code=429, detail="Too Many Requests", headers={"Retry-After": str(retry)})


async def readings_rate_limit(request: Request):
    """Limit readings ingestion per client IP.

    Defaults: 120 requests per 60 seconds.
    """
    ip = _client_ip(request)
    key = f"rl:readings:{ip}"
    limit = 120
    window = 60

    client = _init_client()
    if client is not None:
        retry = _redis_check(client, key, limit, window)
        if retry:
            raise HTTPException(status_code=429, detail="Too Many Requests", headers={"Retry-After": str(retry)})
        return

    retry = await _in_memory_check(key, limit, window)
    if retry:
        raise HTTPException(status_code=429, detail="Too Many Requests", headers={"Retry-After": str(retry)})


async def registration_rate_limit(request: Request):
    """Limit account creation attempts per client IP."""
    ip = _client_ip(request)
    key = f"rl:registration:{ip}"
    limit = 5
    window = 300

    client = _init_client()
    if client is not None:
        retry = _redis_check(client, key, limit, window)
        if retry:
            raise HTTPException(status_code=429, detail="Too Many Requests", headers={"Retry-After": str(retry)})
        return

    retry = await _in_memory_check(key, limit, window)
    if retry:
        raise HTTPException(status_code=429, detail="Too Many Requests", headers={"Retry-After": str(retry)})
