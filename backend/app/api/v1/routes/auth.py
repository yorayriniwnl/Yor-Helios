from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

try:
    from backend.app.services.auth_service import (
        login_with_session as auth_login,
        refresh_session,
        revoke_session_for_refresh_token,
    )
    from backend.app.core.database import get_db
    from backend.app.dependencies.auth import get_current_session
    from backend.app.dependencies.rate_limiter import login_rate_limit, refresh_rate_limit
except Exception:
    from ...services.auth_service import (
        login_with_session as auth_login,
        refresh_session,
        revoke_session_for_refresh_token,
    )
    from ...core.database import get_db
    from ...dependencies.auth import get_current_session
    from ...dependencies.rate_limiter import login_rate_limit, refresh_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=32, max_length=512)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


@router.post("/login", response_model=TokenResponse)
def login_route(payload: LoginRequest, db: Session = Depends(get_db), _rl=Depends(login_rate_limit)):
    try:
        result = auth_login(db, payload.email, payload.password)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # Keep test and extension compatibility for older adapters that returned
    # only an access token; the real service always returns a full bundle.
    if isinstance(result, str):
        return {"access_token": result, "refresh_token": "", "token_type": "bearer", "expires_in": 0}
    return result


@router.post("/refresh", response_model=TokenResponse)
def refresh_route(payload: RefreshRequest, db: Session = Depends(get_db), _rl=Depends(refresh_rate_limit)):
    try:
        return refresh_session(db, payload.refresh_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout_route(
    payload: RefreshRequest,
    db: Session = Depends(get_db),
    current_session=Depends(get_current_session),
):
    try:
        revoke_session_for_refresh_token(
            db,
            payload.refresh_token,
            expected_session_id=current_session.session_id,
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
