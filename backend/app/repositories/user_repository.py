from typing import Optional
from sqlalchemy.orm import Session

try:
    from backend.app.models.user import User
except Exception:
    from ..models.user import User


def create_user(db: Session, name: str, email: str, password_hash: str, is_active: bool = True, role_id: Optional[int] = None) -> User:
    """Create and return a new User."""
    user = User(
        name=name,
        email=email,
        password_hash=password_hash,
        is_active=is_active,
        role_id=role_id,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise
    return user


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Return a user by email or None."""
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    """Return a user by id or None."""
    return db.query(User).filter(User.id == user_id).first()
