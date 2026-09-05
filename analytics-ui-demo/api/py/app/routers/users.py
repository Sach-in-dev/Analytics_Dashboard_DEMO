"""Users router — admin-only user management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_analytics_db
from app.models.user_model import AnalyticsUser
from app.dependencies import require_permission
from app.schemas.responses import success_response, error_response

router = APIRouter(prefix="/users", tags=["Users"])


# --- Request schemas ---

class UpdatePermissionsDto(BaseModel):
    permissions: list[str]  # e.g. ["orders", "carts", "products"]


class UpdateRoleDto(BaseModel):
    role: str  # "admin" or "user"


class UpdateStatusDto(BaseModel):
    is_active: bool


class CreateUserDto(BaseModel):
    email: str
    name: str
    password: str = "changeme123"  # default password
    role: str = "user"
    permissions: list[str] = []


class ResetPasswordDto(BaseModel):
    new_password: str


# --- Endpoints ---

VALID_PERMISSIONS = {
    "orders", "coupons", "utm", "carts", "products", "admin", "searches", "active-users",
    "events", "reviews", "inventory", "correlations", "rfm", "ltv", "rpr", "funnel_metrics",
    "repeat_cohorts", "lifetime_cohorts", "utm_attribution", "flow_attribution", "rto_metrics",
    "delivery_time", "failure_zones", "return_rate", "geography_revenue", "ceo_dashboard",
    "courier_performance", "export", "payment_failure", "return_reasons", "channel_roi",
    "campaign_cac", "marketing_cost", "creative_performance", "audience_roas", "influencer_attribution",
    # New metrics
    "growth", "metric_library", "retention", "marketing_platforms", "clv",
    "engagement", "acquisition_retention", "signup_cohorts",
}



@router.get("")
async def list_users(
    request: Request,
    current_user: AnalyticsUser = Depends(require_permission("admin")),
    db: AsyncSession = Depends(get_analytics_db),
):
    """List all users (admin only)."""
    result = await db.execute(select(AnalyticsUser).order_by(AnalyticsUser.created_at))
    users = result.scalars().all()

    data = [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "permissions": u.permissions or [],
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "updated_at": u.updated_at.isoformat() if u.updated_at else None,
        }
        for u in users
    ]
    return success_response(data=data, path=str(request.url.path))


@router.get("/{user_id}")
async def get_user(
    user_id: str,
    request: Request,
    current_user: AnalyticsUser = Depends(require_permission("admin")),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get a specific user (admin only)."""
    result = await db.execute(
        select(AnalyticsUser).where(AnalyticsUser.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return success_response(
        data={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "permissions": user.permissions or [],
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        },
        path=str(request.url.path),
    )


@router.post("")
async def create_user(
    data: CreateUserDto,
    request: Request,
    current_user: AnalyticsUser = Depends(require_permission("admin")),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Create a new user (admin only)."""
    # Check email not already taken
    existing = await db.execute(
        select(AnalyticsUser).where(AnalyticsUser.email == data.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    # Validate permissions
    invalid = set(data.permissions) - VALID_PERMISSIONS
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid permissions: {', '.join(invalid)}")

    if data.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")

    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user = AnalyticsUser(
        email=data.email,
        name=data.name,
        role=data.role,
        permissions=data.permissions,
    )
    user.set_password(data.password)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return success_response(
        data={"id": user.id, "email": user.email, "name": user.name, "role": user.role, "permissions": user.permissions},
        message=f"User created with password: {data.password}",
        path=str(request.url.path),
    )


@router.put("/{user_id}/permissions")
async def update_permissions(
    user_id: str,
    data: UpdatePermissionsDto,
    request: Request,
    current_user: AnalyticsUser = Depends(require_permission("admin")),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Update permissions for a user (admin only)."""
    result = await db.execute(
        select(AnalyticsUser).where(AnalyticsUser.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate permissions
    invalid = set(data.permissions) - VALID_PERMISSIONS
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid permissions: {', '.join(invalid)}")

    user.permissions = data.permissions
    await db.commit()

    return success_response(
        data={"id": user.id, "email": user.email, "permissions": user.permissions},
        message="Permissions updated",
        path=str(request.url.path),
    )


@router.put("/{user_id}/role")
async def update_role(
    user_id: str,
    data: UpdateRoleDto,
    request: Request,
    current_user: AnalyticsUser = Depends(require_permission("admin")),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Change a user's role (admin only)."""
    if data.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")

    result = await db.execute(
        select(AnalyticsUser).where(AnalyticsUser.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent removing admin from self
    if user.id == current_user.id and data.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot remove admin role from yourself")

    user.role = data.role
    await db.commit()

    return success_response(
        data={"id": user.id, "email": user.email, "role": user.role},
        message="Role updated",
        path=str(request.url.path),
    )


@router.put("/{user_id}/status")
async def update_status(
    user_id: str,
    data: UpdateStatusDto,
    request: Request,
    current_user: AnalyticsUser = Depends(require_permission("admin")),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Activate/deactivate a user (admin only)."""
    result = await db.execute(
        select(AnalyticsUser).where(AnalyticsUser.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent deactivating self
    if user.id == current_user.id and not data.is_active:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    user.is_active = data.is_active
    await db.commit()

    return success_response(
        data={"id": user.id, "email": user.email, "is_active": user.is_active},
        message=f"User {'activated' if data.is_active else 'deactivated'}",
        path=str(request.url.path),
    )


@router.put("/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    data: ResetPasswordDto,
    request: Request,
    current_user: AnalyticsUser = Depends(require_permission("admin")),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Reset a user's password (admin only)."""
    result = await db.execute(
        select(AnalyticsUser).where(AnalyticsUser.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user.set_password(data.new_password)
    await db.commit()

    return success_response(
        data={"id": user.id, "email": user.email},
        message="Password reset successful",
        path=str(request.url.path),
    )
