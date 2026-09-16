import json
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
AUTH_SUBPROTOCOL = "helios-auth"

try:
    from backend.app.services.websocket_service import connect as ws_connect, disconnect as ws_disconnect, broadcast as ws_broadcast
    from backend.app.core.security import decode_token
    from backend.app.core.database import SessionLocal
    from backend.app.repositories.user_repository import get_user_by_id
    from backend.app.repositories.auth_session_repository import get_session_by_id
except Exception:
    from ...services.websocket_service import connect as ws_connect, disconnect as ws_disconnect, broadcast as ws_broadcast
    from ...core.security import decode_token
    from ...core.database import SessionLocal
    from ...repositories.user_repository import get_user_by_id
    from ...repositories.auth_session_repository import get_session_by_id


def authenticate_websocket_token(db, token: str):
    """Return the active user for a token, including session revocation checks."""
    payload = decode_token(token or "")
    user_id = int(payload.get("sub", payload.get("user_id")))
    user = get_user_by_id(db, user_id)
    if user is None or not getattr(user, "is_active", False):
        raise ValueError("inactive user")

    session_id = payload.get("sid")
    if session_id:
        session = get_session_by_id(db, str(session_id))
        expires_at = getattr(session, "expires_at", None)
        if expires_at is not None and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if (
            session is None
            or getattr(session, "user_id", None) != user_id
            or getattr(session, "revoked_at", None) is not None
            or expires_at is None
            or expires_at <= datetime.now(timezone.utc)
        ):
            raise ValueError("invalid session")
    return user


@router.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    """Stream server-generated telemetry to authenticated operators.

    Browser WebSocket clients cannot set an Authorization header, so the
    frontend offers the short-lived access token as a subprotocol. The server
    selects only the fixed ``helios-auth`` protocol; the token is not echoed
    into the URL or response. A query-token fallback is retained for older
    non-browser clients and is redacted by the access-log filter.
    """
    offered_protocols = [
        value.strip()
        for value in websocket.headers.get("sec-websocket-protocol", "").split(",")
        if value.strip()
    ]
    await websocket.accept(subprotocol=AUTH_SUBPROTOCOL if AUTH_SUBPROTOCOL in offered_protocols else None)
    token = websocket.query_params.get("token")
    authorization = websocket.headers.get("authorization", "")
    if not token and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not token and AUTH_SUBPROTOCOL in offered_protocols:
        protocol_index = offered_protocols.index(AUTH_SUBPROTOCOL)
        if protocol_index + 1 < len(offered_protocols):
            token = offered_protocols[protocol_index + 1]

    db = SessionLocal()
    try:
        authenticate_websocket_token(db, token or "")
    except Exception:
        db.close()
        await websocket.close(code=1008, reason="Authentication required")
        return
    finally:
        if db.is_active:
            db.close()

    ws_connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data.strip().lower() == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        ws_disconnect(websocket)
