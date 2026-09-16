"""Password hashing and JWT utilities.

Compatible with both passlib+bcrypt and a pure-Python fallback so tests
run without a native bcrypt build (which trips on Python 3.12).
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import hashlib
import hmac
import os
import secrets
import uuid

import jwt

try:
    from backend.app.core.config import settings
except Exception:
    from .config import settings

# ── Password hashing ──────────────────────────────────────────────────────────
# Try passlib/bcrypt first; fall back to PBKDF2-SHA256 (always available).

def _try_passlib():
    try:
        from passlib.context import CryptContext
        ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        # Quick smoke test to catch broken bcrypt builds early
        ctx.hash("test")[:2]  # will raise if broken
        return ctx
    except Exception:
        return None

_pwd_context = _try_passlib()


def hash_password(password: str) -> str:
    """Hash a plaintext password."""
    # bcrypt implementations reject passwords over 72 UTF-8 bytes. Do not
    # silently truncate them: that would make two different passwords share
    # the same credential. PBKDF2 is the portable path for long passwords.
    if _pwd_context is not None and len(password.encode("utf-8")) <= 72:
        try:
            return _pwd_context.hash(password)
        except Exception:
            pass
    # PBKDF2-SHA256 fallback (compatible everywhere)
    salt = os.urandom(16).hex()
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260_000)
    return f"pbkdf2:{salt}:{dk.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify a plaintext password against a stored hash."""
    if hashed.startswith("pbkdf2:"):
        try:
            _, salt, stored = hashed.split(":", 2)
            dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260_000)
            return hmac.compare_digest(dk.hex(), stored)
        except Exception:
            return False
    if _pwd_context is not None:
        try:
            if len(password.encode("utf-8")) > 72:
                return False
            return _pwd_context.verify(password, hashed)
        except Exception:
            pass
    return False


# ── JWT ───────────────────────────────────────────────────────────────────────

ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 30


def hash_refresh_token(token: str) -> str:
    """Hash opaque refresh material before it is stored or queried."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_refresh_token() -> tuple[str, str]:
    """Return raw refresh material and its storage hash."""
    raw_token = secrets.token_urlsafe(48)
    return raw_token, hash_refresh_token(raw_token)


def create_access_token(
    user_id: int,
    expires_delta: Optional[timedelta] = None,
    session_id: Optional[str] = None,
) -> str:
    """Create a short-lived JWT with an explicit subject and issued-at time."""
    if expires_delta is None:
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.now(timezone.utc) + expires_delta
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "user_id": user_id,
        "iat": datetime.now(timezone.utc),
        "jti": uuid.uuid4().hex,
        "exp": expire,
    }
    if session_id:
        payload["sid"] = session_id
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    return token.decode("utf-8") if isinstance(token, bytes) else token


def decode_token(token: str) -> Dict[str, Any]:
    """Decode a JWT and return its payload."""
    return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
