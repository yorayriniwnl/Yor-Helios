from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

try:
    from backend.app.services.user_service import create_user as service_create_user, get_user as service_get_user
    from backend.app.schemas.user import UserCreate, UserResponse
    from backend.app.core.database import get_db
    from backend.app.core.security import hash_password
    from backend.app.dependencies.auth import get_current_user
    from backend.app.dependencies.auth import require_roles
    from backend.app.dependencies.rate_limiter import registration_rate_limit
    from backend.app.repositories.role_repository import get_or_create_role
    from backend.app.models.role import Role
    from backend.app.models.user import User
    from backend.app.services.audit_service import log_action as svc_log_action
except Exception:
    from ...services.user_service import create_user as service_create_user, get_user as service_get_user
    from ...schemas.user import UserCreate, UserResponse
    from ...core.database import get_db
    from ...core.security import hash_password
    from ...dependencies.auth import get_current_user
    from ...dependencies.auth import require_roles
    from ...dependencies.rate_limiter import registration_rate_limit
    from ...repositories.role_repository import get_or_create_role
    from ...models.role import Role
    from ...models.user import User
    from ...services.audit_service import log_action as svc_log_action

router = APIRouter(prefix="/users", tags=["users"])


class RoleChangeRequest(BaseModel):
    role_name: str = Field(..., min_length=1, max_length=32)


_ROLE_ALIASES = {
    "admin": "admin",
    "administrator": "admin",
    "operator": "operator",
    "inspector": "inspector",
    "viewer": "viewer",
}


@router.post("/", response_model=UserResponse)
def create_user(user_in: UserCreate, db: Session = Depends(get_db), _rl=Depends(registration_rate_limit)):
    # Hash incoming plaintext password before storing
    pw_hash = hash_password(user_in.password)
    try:
        viewer_role = get_or_create_role(db, "viewer")
        user = service_create_user(
            db,
            name=user_in.name,
            email=user_in.email,
            password_hash=pw_hash,
            role_id=viewer_role.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return user


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db), current_user: object = Depends(get_current_user)):
    if user_id != getattr(current_user, "id", None):
        role = getattr(getattr(current_user, "role", None), "name", "") or ""
        if role.lower() not in {"admin", "administrator"}:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
    user = service_get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}/role", response_model=UserResponse)
def change_user_role(
    user_id: int,
    role_change: RoleChangeRequest,
    db: Session = Depends(get_db),
    current_user: object = Depends(require_roles("admin", "administrator")),
):
    """Change a user's role; only administrators may use this endpoint."""
    target = service_get_user(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    requested = role_change.role_name.strip().lower()
    canonical_name = _ROLE_ALIASES.get(requested)
    if canonical_name is None:
        raise HTTPException(status_code=422, detail="Unknown role")

    current_role = (getattr(getattr(target, "role", None), "name", "") or "").strip().lower()
    if target.id == getattr(current_user, "id", None) and current_role in {"admin", "administrator"} and canonical_name != "admin":
        admin_count = (
            db.query(User)
            .join(Role)
            .filter(func.lower(Role.name).in_({"admin", "administrator"}))
            .count()
        )
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="At least one administrator must remain")

    role = get_or_create_role(db, canonical_name)
    target.role_id = role.id
    db.commit()
    db.refresh(target)
    svc_log_action(
        db,
        user_id=getattr(current_user, "id", None),
        action="user_role_changed",
        entity="user",
        entity_id=target.id,
        metadata={"role": canonical_name},
    )
    return target
