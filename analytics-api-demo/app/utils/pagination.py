"""Pagination utility — direct port of NestJS pagination.utils.ts."""

from typing import Any
import math


class Paginate:
    def __init__(
        self,
        page: int = 1,
        limit: int = 10,
        search: str | None = None,
        search_fields: str | None = None,
        sort: str | None = None,
    ):
        self.page = max(page, 1)
        self.limit = max(limit, 1)
        self.search = search
        self.search_field_list = (
            [f.strip() for f in search_fields.split(",")]
            if search_fields
            else []
        )
        self._sort = self._parse_sort(sort)

    def _parse_sort(self, sort: str | None):
        if not sort:
            return None
        parts = sort.split(":")
        field = parts[0].strip()
        direction = parts[1].strip().lower() if len(parts) > 1 else "desc"
        return {"field": field, "direction": direction}

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit

    @property
    def order_by(self):
        return self._sort

    def response(self, data: list, count: int) -> dict:
        return {
            "data": data,
            "meta": {
                "total": count,
                "page": self.page,
                "limit": self.limit,
                "totalPages": math.ceil(count / self.limit) if self.limit else 0,
            },
        }
