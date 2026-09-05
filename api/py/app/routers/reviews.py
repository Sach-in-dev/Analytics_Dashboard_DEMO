"""Reviews router — queries product_reviews_local from analytics DB."""

import math
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission

router = APIRouter(prefix="/reviews", tags=["Reviews"], dependencies=[Depends(require_permission("reviews"))])


@router.get("/summary")
async def get_reviews_summary(
    request: Request,
    start_date: str = Query(..., description="Start YYYY-MM-DD"),
    end_date: str = Query(..., description="End YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    query = text("""
        SELECT
            COUNT(*) as total_reviews,
            COALESCE(AVG(rating), 0) as average_rating,
            SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
            SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
            SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
            SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
            SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
        FROM product_reviews_local
        WHERE spam = false
        AND created_at >= :start_dt AND created_at <= :end_dt
    """)

    start_dt = datetime.strptime(f"{start_date} 00:00:00", "%Y-%m-%d %H:%M:%S")
    end_dt = datetime.strptime(f"{end_date} 23:59:59", "%Y-%m-%d %H:%M:%S")

    result = await db.execute(query, {"start_dt": start_dt, "end_dt": end_dt})
    row = result.fetchone()

    total = row[0] or 0
    five = row[2] or 0
    four = row[3] or 0
    three = row[4] or 0
    two = row[5] or 0
    one = row[6] or 0
    data = {
        "total_reviews": total,
        "average_rating": float(row[1] or 0),
        "distribution": {
            "5": five, "4": four, "3": three, "2": two, "1": one,
        },
        # Flat numeric summary — powers the Period Comparison card.
        "summary": {
            "total_reviews": total,
            "average_rating": round(float(row[1] or 0), 2),
            "five_star": five,
            "four_star": four,
            "three_star": three,
            "two_star": two,
            "one_star": one,
        },
    }

    return success_response(data=data, path=str(request.url.path))


@router.get("/top-products")
async def get_top_reviewed_products(
    request: Request,
    start_date: str = Query(..., description="Start YYYY-MM-DD"),
    end_date: str = Query(..., description="End YYYY-MM-DD"),
    limit: int = Query(10, description="Max products to return"),
    db: AsyncSession = Depends(get_analytics_db),
):
    query = text("""
        SELECT
            product_title,
            COUNT(id) as review_count,
            COALESCE(AVG(rating), 0) as average_rating
        FROM product_reviews_local
        WHERE spam = false
        AND created_at >= :start_dt AND created_at <= :end_dt
        AND product_title IS NOT NULL
        GROUP BY product_title
        ORDER BY review_count DESC
        LIMIT :limit
    """)

    start_dt = datetime.strptime(f"{start_date} 00:00:00", "%Y-%m-%d %H:%M:%S")
    end_dt = datetime.strptime(f"{end_date} 23:59:59", "%Y-%m-%d %H:%M:%S")

    result = await db.execute(query, {"start_dt": start_dt, "end_dt": end_dt, "limit": limit})
    rows = result.fetchall()

    data = []
    for r in rows:
        data.append({
            "product_title": r[0],
            "review_count": r[1],
            "average_rating": float(r[2])
        })

    return success_response(data=data, path=str(request.url.path))


@router.get("/recent")
async def get_recent_reviews(
    request: Request,
    start_date: str = Query(..., description="Start YYYY-MM-DD"),
    end_date: str = Query(..., description="End YYYY-MM-DD"),
    limit: int = Query(20, description="Max reviews to return"),
    db: AsyncSession = Depends(get_analytics_db),
):
    query = text("""
        SELECT
            id,
            rating,
            title,
            comment,
            first_name,
            last_name,
            created_at,
            product_title
        FROM product_reviews_local
        WHERE spam = false
        AND created_at >= :start_dt AND created_at <= :end_dt
        ORDER BY created_at DESC
        LIMIT :limit
    """)

    start_dt = datetime.strptime(f"{start_date} 00:00:00", "%Y-%m-%d %H:%M:%S")
    end_dt = datetime.strptime(f"{end_date} 23:59:59", "%Y-%m-%d %H:%M:%S")

    result = await db.execute(query, {"start_dt": start_dt, "end_dt": end_dt, "limit": limit})
    rows = result.fetchall()

    data = []
    for r in rows:
        data.append({
            "id": r[0],
            "rating": r[1],
            "title": r[2],
            "comment": r[3],
            "first_name": r[4],
            "last_name": r[5],
            # A raw text() query returns a native datetime on Postgres but a
            # plain string on SQLite — handle both.
            "created_at": (r[6].isoformat() if hasattr(r[6], "isoformat") else r[6]) if r[6] else None,
            "product_title": r[7]
        })

    return success_response(data=data, path=str(request.url.path))


@router.get("/product-ratings")
async def get_product_ratings(
    request: Request,
    start_date: str = Query(..., description="Start YYYY-MM-DD"),
    end_date: str = Query(..., description="End YYYY-MM-DD"),
    page: int = Query(1, description="Page number"),
    limit: int = Query(10, description="Items per page"),
    sort_by: str = Query("highest", description="highest, lowest, most_reviewed"),
    db: AsyncSession = Depends(get_analytics_db),
):
    offset = (page - 1) * limit

    order_clause = "ORDER BY average_rating DESC, review_count DESC"
    if sort_by == "lowest":
        order_clause = "ORDER BY average_rating ASC, review_count DESC"
    elif sort_by == "most_reviewed":
        order_clause = "ORDER BY review_count DESC, average_rating DESC"

    query = text(f"""
        WITH paginated_products AS (
            SELECT
                product_title,
                COUNT(id) as review_count,
                COALESCE(AVG(rating), 0) as average_rating
            FROM product_reviews_local
            WHERE spam = false
            AND created_at >= :start_dt AND created_at <= :end_dt
            AND product_title IS NOT NULL
            GROUP BY product_title
            HAVING COUNT(id) > 0
        )
        SELECT product_title, review_count, average_rating
        FROM paginated_products
        {order_clause}
        LIMIT :limit OFFSET :offset
    """)

    count_query = text("""
        SELECT COUNT(DISTINCT product_title)
        FROM product_reviews_local
        WHERE spam = false
        AND created_at >= :start_dt AND created_at <= :end_dt
        AND product_title IS NOT NULL
    """)

    start_dt = datetime.strptime(f"{start_date} 00:00:00", "%Y-%m-%d %H:%M:%S")
    end_dt = datetime.strptime(f"{end_date} 23:59:59", "%Y-%m-%d %H:%M:%S")

    count_res = await db.execute(count_query, {"start_dt": start_dt, "end_dt": end_dt})
    total = count_res.scalar()

    result = await db.execute(query, {
        "start_dt": start_dt,
        "end_dt": end_dt,
        "limit": limit,
        "offset": offset
    })
    rows = result.fetchall()

    data = []
    for r in rows:
        data.append({
            "product_title": r[0],
            "review_count": r[1],
            "average_rating": float(r[2])
        })

    return success_response(
        data=data,
        path=str(request.url.path),
        meta={"total": total, "lastPage": math.ceil(total / limit) if total else 1}
    )
