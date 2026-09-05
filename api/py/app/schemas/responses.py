"""Standardized API response schemas — matches NestJS ResponseInterceptor output."""

from typing import Any, Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class StandardResponse(BaseModel):
    statusCode: int = 200
    success: bool = True
    data: Any = None
    path: str = ""
    message: str = "Success"
    meta: Any = {}


class ErrorResponse(BaseModel):
    success: bool = False
    statusCode: int = 500
    data: None = None
    errors: Any = None
    path: str = ""
    message: str = "Internal Server Error"
    stackTrace: str | None = None


class PaginatedMeta(BaseModel):
    total: int
    page: int
    limit: int
    totalPages: int


def success_response(
    data: Any = None,
    message: str = "Success",
    path: str = "",
    meta: Any = None,
    status_code: int = 200,
) -> dict:
    return {
        "statusCode": status_code,
        "success": True,
        "data": data,
        "path": path,
        "message": message,
        "meta": meta or {},
    }


def error_response(
    message: str = "Internal Server Error",
    status_code: int = 500,
    path: str = "",
    errors: Any = None,
) -> dict:
    return {
        "success": False,
        "statusCode": status_code,
        "data": None,
        "errors": errors,
        "path": path,
        "message": message,
    }
