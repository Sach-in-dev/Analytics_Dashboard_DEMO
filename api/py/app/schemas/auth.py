"""Auth DTOs — port of NestJS sign-in.dto.ts, sign-up.dto.ts, refresh-token.dto.ts."""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class SignInDto(BaseModel):
    email: EmailStr
    password: str


class SignUpDto(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    firstName: Optional[str] = None
    lastName: Optional[str] = None


class RefreshTokenDto(BaseModel):
    refreshToken: str


class AuthTokens(BaseModel):
    accessToken: Optional[str] = None
    refreshToken: Optional[str] = None
    expiresIn: Optional[str] = None


class AuthUser(BaseModel):
    id: str
    email: str
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    avatarUrl: Optional[str] = None


class AuthResponse(BaseModel):
    tokens: AuthTokens
    user: AuthUser
