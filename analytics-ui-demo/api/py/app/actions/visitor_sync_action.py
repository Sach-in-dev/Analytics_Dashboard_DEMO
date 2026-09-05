import logging
from datetime import datetime, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.analytics import DailyVisitorMetrics, MonthlyVisitorMetrics
from app.database import AnalyticsSessionLocal, ProdSessionLocal

logger = logging.getLogger(__name__)

async def sync_daily_visitors(target_date: str):
    """Aggregate visitor metrics for a specific date from prod DB."""
    logger.info(f"Syncing daily visitors for {target_date}")
    
    start_dt = datetime.strptime(f"{target_date} 00:00:00", "%Y-%m-%d %H:%M:%S")
    end_dt = datetime.strptime(f"{target_date} 23:59:59", "%Y-%m-%d %H:%M:%S")

    query = text("""
        SELECT count(distinct ip) as unique_visitors
        FROM public.visitors
        WHERE created_at >= :start_dt AND created_at <= :end_dt
    """)

    async with ProdSessionLocal() as prod_db:
        result = await prod_db.execute(query, {"start_dt": start_dt, "end_dt": end_dt})
        unique_visitors = result.scalar() or 0

    async with AnalyticsSessionLocal() as analytics_db:
        # Check if exists
        check_q = text("SELECT id FROM daily_visitor_metrics WHERE date = :date")
        exists = await analytics_db.execute(check_q, {"date": datetime.strptime(target_date, "%Y-%m-%d")})
        record_id = exists.scalar()

        if record_id:
            update_q = text("""
                UPDATE daily_visitor_metrics 
                SET unique_visitors = :uv
                WHERE id = :id
            """)
            await analytics_db.execute(update_q, {"uv": unique_visitors, "id": record_id})
        else:
            from app.models.analytics import gen_uuid
            insert_q = text("""
                INSERT INTO daily_visitor_metrics (id, date, unique_visitors, "createdAt")
                VALUES (:id, :date, :uv, :ca)
            """)
            await analytics_db.execute(insert_q, {"id": gen_uuid(), "date": datetime.strptime(target_date, "%Y-%m-%d"), "uv": unique_visitors, "ca": datetime.utcnow()})
        
        await analytics_db.commit()


async def sync_monthly_visitors(year: int, month: int):
    """Aggregate visitor metrics for a specific month from prod DB."""
    logger.info(f"Syncing monthly visitors for {year}-{month:02d}")
    
    start_date = datetime.strptime(f"{year}-{month:02d}-01 00:00:00", "%Y-%m-%d %H:%M:%S")
    if month == 12:
        end_date = datetime.strptime(f"{year+1}-01-01 00:00:00", "%Y-%m-%d %H:%M:%S")
    else:
        end_date = datetime.strptime(f"{year}-{month+1:02d}-01 00:00:00", "%Y-%m-%d %H:%M:%S")

    query = text("""
        SELECT count(distinct ip) as unique_visitors
        FROM public.visitors
        WHERE created_at >= :start_dt AND created_at < :end_dt
    """)

    async with ProdSessionLocal() as prod_db:
        result = await prod_db.execute(query, {"start_dt": start_date, "end_dt": end_date})
        unique_visitors = result.scalar() or 0
        
    async with AnalyticsSessionLocal() as analytics_db:
        # Check if exists
        check_q = text("SELECT id FROM monthly_visitor_metrics WHERE year = :y AND month = :m")
        exists = await analytics_db.execute(check_q, {"y": year, "m": month})
        record_id = exists.scalar()

        if record_id:
            update_q = text("""
                UPDATE monthly_visitor_metrics 
                SET unique_visitors = :uv
                WHERE id = :id
            """)
            await analytics_db.execute(update_q, {"uv": unique_visitors, "id": record_id})
        else:
            from app.models.analytics import gen_uuid
            insert_q = text("""
                INSERT INTO monthly_visitor_metrics (id, year, month, unique_visitors, "createdAt")
                VALUES (:id, :y, :m, :uv, :ca)
            """)
            await analytics_db.execute(insert_q, {"id": gen_uuid(), "y": year, "m": month, "uv": unique_visitors, "ca": datetime.utcnow()})
        
        await analytics_db.commit()
