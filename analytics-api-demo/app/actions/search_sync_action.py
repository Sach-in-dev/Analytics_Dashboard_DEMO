import logging
from datetime import datetime, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.analytics import DailySearchMetrics, MonthlySearchMetrics
from app.database import AnalyticsSessionLocal, ProdSessionLocal

logger = logging.getLogger(__name__)

async def sync_daily_searches(target_date: str):
    """Aggregate search metrics for a specific date from prod DB."""
    logger.info(f"Syncing daily searches for {target_date}")
    
    start_dt = datetime.strptime(f"{target_date} 00:00:00", "%Y-%m-%d %H:%M:%S")
    end_dt = datetime.strptime(f"{target_date} 23:59:59", "%Y-%m-%d %H:%M:%S")

    query = text("""
        SELECT 
            COUNT(*) as total_searches,
            COUNT(DISTINCT COALESCE(customer_id, ip_address, CAST(id AS TEXT))) as unique_searchers,
            SUM(CASE WHEN total_result > 0 THEN 1 ELSE 0 END) as with_results,
            SUM(CASE WHEN total_result = 0 THEN 1 ELSE 0 END) as zero_results
        FROM customer_searches
        WHERE created_at >= :start_dt AND created_at <= :end_dt
    """)

    async with ProdSessionLocal() as prod_db:
        result = await prod_db.execute(query, {"start_dt": start_dt, "end_dt": end_dt})
        row = result.fetchone()

    total_searches = int(row[0] or 0)
    unique_searchers = int(row[1] or 0)
    with_results = int(row[2] or 0)
    zero_results = int(row[3] or 0)

    async with AnalyticsSessionLocal() as analytics_db:
        # Check if exists
        check_q = text("SELECT id FROM daily_search_metrics WHERE date = :date")
        exists = await analytics_db.execute(check_q, {"date": datetime.strptime(target_date, "%Y-%m-%d")})
        record_id = exists.scalar()

        if record_id:
            update_q = text("""
                UPDATE daily_search_metrics 
                SET total_searches = :tot, unique_searchers = :uni, with_results = :with, zero_results = :zero
                WHERE id = :id
            """)
            await analytics_db.execute(update_q, {"tot": total_searches, "uni": unique_searchers, "with": with_results, "zero": zero_results, "id": record_id})
        else:
            from app.models.analytics import gen_uuid
            insert_q = text("""
                INSERT INTO daily_search_metrics (id, date, total_searches, unique_searchers, with_results, zero_results, "createdAt")
                VALUES (:id, :date, :tot, :uni, :with, :zero, :ca)
            """)
            await analytics_db.execute(insert_q, {"id": gen_uuid(), "date": datetime.strptime(target_date, "%Y-%m-%d"), "tot": total_searches, "uni": unique_searchers, "with": with_results, "zero": zero_results, "ca": datetime.utcnow()})
        
        await analytics_db.commit()


async def sync_monthly_searches(year: int, month: int):
    """Aggregate search metrics for a specific month from daily tables."""
    logger.info(f"Syncing monthly searches for {year}-{month:02d}")
    
    start_date = datetime.strptime(f"{year}-{month:02d}-01", "%Y-%m-%d")
    if month == 12:
        end_date = datetime.strptime(f"{year+1}-01-01", "%Y-%m-%d")
    else:
        end_date = datetime.strptime(f"{year}-{month+1:02d}-01", "%Y-%m-%d")

    query = text("""
        SELECT 
            SUM(total_searches) as total_searches,
            SUM(unique_searchers) as unique_searchers,
            SUM(with_results) as with_results,
            SUM(zero_results) as zero_results
        FROM daily_search_metrics
        WHERE date >= :start_date AND date < :end_date
    """)

    async with AnalyticsSessionLocal() as analytics_db:
        result = await analytics_db.execute(query, {"start_date": start_date, "end_date": end_date})
        row = result.fetchone()

        total_searches = int(row[0] or 0)
        unique_searchers = int(row[1] or 0) # approximation for monthly unique (since daily are distinct per day)
        with_results = int(row[2] or 0)
        zero_results = int(row[3] or 0)

        # Check if exists
        check_q = text("SELECT id FROM monthly_search_metrics WHERE year = :y AND month = :m")
        exists = await analytics_db.execute(check_q, {"y": year, "m": month})
        record_id = exists.scalar()

        if record_id:
            update_q = text("""
                UPDATE monthly_search_metrics 
                SET total_searches = :tot, unique_searchers = :uni, with_results = :with, zero_results = :zero
                WHERE id = :id
            """)
            await analytics_db.execute(update_q, {"tot": total_searches, "uni": unique_searchers, "with": with_results, "zero": zero_results, "id": record_id})
        else:
            from app.models.analytics import gen_uuid
            insert_q = text("""
                INSERT INTO monthly_search_metrics (id, year, month, total_searches, unique_searchers, with_results, zero_results, "createdAt")
                VALUES (:id, :y, :m, :tot, :uni, :with, :zero, :ca)
            """)
            await analytics_db.execute(insert_q, {"id": gen_uuid(), "y": year, "m": month, "tot": total_searches, "uni": unique_searchers, "with": with_results, "zero": zero_results, "ca": datetime.utcnow()})
        
        await analytics_db.commit()
