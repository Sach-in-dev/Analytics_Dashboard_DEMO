"""Auth router — local database authentication with JWT tokens."""

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_analytics_db
from app.models.user_model import AnalyticsUser
from app.dependencies import create_access_token, get_current_user
from app.schemas.responses import success_response, error_response
import logging

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)


class LoginDto(BaseModel):
    email: str
    password: str


class ChangePasswordDto(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
async def login(
    data: LoginDto, request: Request, response: Response,
    db: AsyncSession = Depends(get_analytics_db),
):
    """Login with email and password from the local database."""
    result = await db.execute(
        select(AnalyticsUser).where(AnalyticsUser.email == data.email)
    )
    user = result.scalar_one_or_none()

    if not user:
        return error_response(message="Invalid email or password", status_code=401, path=str(request.url.path))

    if not user.verify_password(data.password):
        return error_response(message="Invalid email or password", status_code=401, path=str(request.url.path))

    if not user.is_active:
        return error_response(message="Your account has been deactivated. Contact admin.", status_code=403, path=str(request.url.path))

    # Create JWT token
    token = create_access_token(user.id, user.email)

    # Set cookie
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=86400,
    )

    return success_response(
        data={
            "token": token,
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "role": user.role,
                "permissions": user.permissions or [],
            },
        },
        message="Login successful",
        path=str(request.url.path),
    )


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Clear the access_token cookie."""
    response.delete_cookie("access_token")
    return success_response(data=None, message="Logged out", path=str(request.url.path))


@router.get("/me")
async def get_me(
    request: Request,
    user: AnalyticsUser = Depends(get_current_user),
):
    """Get current authenticated user info."""
    return success_response(
        data={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "permissions": user.permissions or [],
        },
        path=str(request.url.path),
    )


@router.post("/change-password")
async def change_password(
    data: ChangePasswordDto,
    request: Request,
    user: AnalyticsUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Change your own password."""
    if not user.verify_password(data.current_password):
        return error_response(message="Current password is incorrect", status_code=400, path=str(request.url.path))

    if len(data.new_password) < 6:
        return error_response(message="New password must be at least 6 characters", status_code=400, path=str(request.url.path))

    user.set_password(data.new_password)
    await db.commit()

    return success_response(data=None, message="Password changed successfully", path=str(request.url.path))
