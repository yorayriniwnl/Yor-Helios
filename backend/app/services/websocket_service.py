"""In-memory WebSocket connection service.

Provides simple connect/disconnect and async broadcast utilities using an in-memory list.
Keep this minimal and transport-agnostic (expects objects with an async `send_text()` method).
"""
import json
from typing import List, Any, Optional
import asyncio

_clients: List[Any] = []
_loop: Optional[asyncio.AbstractEventLoop] = None
_broadcast_lock = asyncio.Lock()
_sequence = 0


def _envelope(message: str) -> str:
    """Add an ordered, deduplicable envelope without changing event payloads."""
    global _sequence
    try:
        payload = json.loads(message)
    except (TypeError, ValueError, json.JSONDecodeError):
        return message
    if not isinstance(payload, dict) or "type" not in payload:
        return message

    _sequence += 1
    payload.setdefault("sequence", _sequence)
    data = payload.get("data")
    if isinstance(data, dict) and data.get("id") is not None:
        payload.setdefault("event_id", f"{payload['type']}:{data['id']}")
    return json.dumps(payload, separators=(",", ":"))


def connect(client: Any) -> None:
    """Register a client connection and capture the running event loop."""
    global _loop
    try:
        _loop = asyncio.get_running_loop()
    except RuntimeError:
        # no running loop in this context; keep existing loop if any
        pass
    if client not in _clients:
        _clients.append(client)


def disconnect(client: Any) -> None:
    """Unregister a client connection."""
    try:
        _clients.remove(client)
    except ValueError:
        pass


async def broadcast(message: str) -> None:
    """Broadcast a text message to all connected clients.

    Silently ignores errors to keep the broadcaster robust.
    """
    # Serialise broadcasts so a burst cannot overtake an earlier event. Each
    # client still has a bounded send timeout, which is the backpressure policy
    # for slow or broken sockets.
    async with _broadcast_lock:
        outbound = _envelope(message)

        async def _send(client: Any) -> Any:
            send = getattr(client, "send_text", None)
            if callable(send):
                return await asyncio.wait_for(send(outbound), timeout=2)
            if callable(client):
                result = client(outbound)
                if asyncio.iscoroutine(result):
                    return await asyncio.wait_for(result, timeout=2)
                return result
            return None

        clients = list(_clients)
        results = await asyncio.gather(*(_send(client) for client in clients), return_exceptions=True)
        for client, result in zip(clients, results):
            if isinstance(result, Exception):
                try:
                    _clients.remove(client)
                except ValueError:
                    pass


def broadcast_sync(message: str) -> None:
    """Schedule broadcast(message) to run on the app's event loop from sync code."""
    if _loop is None:
        return
    try:
        asyncio.run_coroutine_threadsafe(broadcast(message), _loop)
    except Exception:
        # best-effort: swallow errors to avoid breaking callers
        pass
