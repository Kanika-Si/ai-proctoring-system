from __future__ import annotations

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    role: str


class LoginResponse(BaseModel):
    access_token: str | None = None
    token_type: str | None = None
    role: str
    user_id: str
    full_name: str


class AuthenticatedUser(BaseModel):
    user_id: str
    role: str
    full_name: str
    email: EmailStr
