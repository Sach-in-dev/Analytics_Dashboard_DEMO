"""Pagination query schemas — port of paginate-query.dto.ts and coupon-query.dto.ts."""

from pydantic import BaseModel, Field
from typing import Optional


class PaginateQuery(BaseModel):
    limit: int = Field(default=10, ge=1)
    page: int = Field(default=1, ge=1)
    searchFields: Optional[str] = None
    search: Optional[str] = None
    sort: Optional[str] = None


class CouponQueryDto(PaginateQuery):
    timezone: str = "Asia/Kolkata"
    date: Optional[str] = None
    year: Optional[int] = Field(default=None, ge=1900, le=2100)
    month: Optional[int] = Field(default=None, ge=1, le=12)
    code: Optional[str] = None


class CouponHistoryQueryDto(BaseModel):
    timezone: str = "Asia/Kolkata"
    startDate: str
    endDate: str
    code: str
    limit: int = Field(default=30, ge=1, le=90)
