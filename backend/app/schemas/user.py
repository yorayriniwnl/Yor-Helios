from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from .base import ORMResponseModel


class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class UserResponse(ORMResponseModel):
    id: int
    name: str
    email: EmailStr
    is_active: bool = True
    role_id: Optional[int] = None
