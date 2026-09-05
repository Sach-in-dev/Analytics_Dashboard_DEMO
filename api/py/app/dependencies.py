"""Auth dependencies — local JWT-based authentication."""

import logging
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_analytics_db
from app.models.user_model import AnalyticsUser
from app.config import get_settings
import jwt

logger = logging.getLogger(__name__)


def create_access_token(user_id: str, email: str) -> str:
    """Create a JWT access token."""
    settings = get_settings()
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_analytics_db),
) -> AnalyticsUser:
    """Validate JWT token and return the AnalyticsUser.

    Checks:
    1. access_token cookie OR Authorization: Bearer <token>
    2. Decodes JWT with local secret
    3. Looks up user in analytics_users table
    """
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Decode JWT locally
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    # Lookup user in analytics_users
    result = await db.execute(
        select(AnalyticsUser).where(AnalyticsUser.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is deactivated")

    return user


def require_permission(resource: str):
    """Dependency factory — checks if the user has permission for a resource."""
    async def _check(user: AnalyticsUser = Depends(get_current_user)):
        if not user.has_permission(resource):
            raise HTTPException(
                status_code=403,
                detail=f"You don't have permission to access '{resource}'",
            )
        return user
    return _check


def require_admin(user: AnalyticsUser = Depends(get_current_user)):
    """Dependency — checks if the user is an admin."""
    if not user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Admin privileges required to perform this action",
        )
    return user
