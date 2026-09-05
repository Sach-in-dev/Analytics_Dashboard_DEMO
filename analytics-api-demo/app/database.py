import logging
import ssl
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

logger = logging.getLogger(__name__)

# SSL context for production DB (DigitalOcean managed Postgres)
_cert_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "certs", "prod-db.crt")
_prod_ssl_ctx = None
if os.path.exists(_cert_path):
    _prod_ssl_ctx = ssl.create_default_context(cafile=_cert_path)
    _prod_ssl_ctx.check_hostname = False
    _prod_ssl_ctx.verify_mode = ssl.CERT_NONE


class Base(DeclarativeBase):
    pass


settings = get_settings()

# Analytics DB engine (read/write)
analytics_engine = create_async_engine(
    settings.analytics_db_url,
    echo=False,
    pool_size=10,
    max_overflow=20,
)

AnalyticsSessionLocal = async_sessionmaker(
    bind=analytics_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Prod DB engine (read-only, for raw SQL queries)
prod_engine = None
ProdSessionLocal = None

if settings.PROD_DB:
    _prod_connect_args = {"ssl": _prod_ssl_ctx} if _prod_ssl_ctx else {"ssl": "require"}
    prod_engine = create_async_engine(
        settings.prod_db_url,
        echo=False,
        pool_size=5,
        max_overflow=10,
        connect_args=_prod_connect_args,
    )
    ProdSessionLocal = async_sessionmaker(
        bind=prod_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def get_analytics_db() -> AsyncSession:
    async with AnalyticsSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_prod_db() -> AsyncSession:
    if ProdSessionLocal is None:
        raise RuntimeError("PROD_DB environment variable is not set")
    async with ProdSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_databases():
    """Test database connections on startup and create any missing tables."""
    try:
        async with analytics_engine.begin() as conn:
            await conn.execute(
                __import__("sqlalchemy").text("SELECT 1")
            )
        logger.info("Successfully connected to analytics database")

        # Auto-create any new tables that don't exist yet (checkfirst=True is safe)
        async with analytics_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Verified analytics database schema (new tables created if needed)")
    except Exception as e:
        logger.warning(f"Failed to connect to analytics database: {e}")
        logger.warning("Server will start but DB-dependent endpoints won't work. Update your .env file.")

    if prod_engine:
        try:
            async with prod_engine.begin() as conn:
                await conn.execute(
                    __import__("sqlalchemy").text("SELECT 1")
                )
            logger.info("Successfully connected to production database")
        except Exception as e:
            logger.error(f"Failed to connect to production database: {e}")


async def close_databases():
    """Close database connections on shutdown."""
    await analytics_engine.dispose()
    logger.info("Disconnected from analytics database")
    if prod_engine:
        await prod_engine.dispose()
        logger.info("Disconnected from production database")
