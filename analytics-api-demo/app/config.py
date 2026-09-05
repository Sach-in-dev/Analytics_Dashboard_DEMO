from pydantic_settings import BaseSettings
from functools import lru_cache
from urllib.parse import quote_plus


class Settings(BaseSettings):
    # Database
    PROD_DB: str = ""
    ANALYTICS_DB: str = ""

    # Separate DB fields (used if ANALYTICS_DB URL is empty or has special chars)
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USER: str = "postgres"
    DB_PASSWORD: str = ""
    DB_NAME: str = "analytics_db"

    # Timezone
    TIMEZONE: str = "Asia/Kolkata"

    # Server
    PORT: int = 3000

    # JWT
    JWT_SECRET: str = "analytics-secret-key-change-in-production"
    JWT_EXPIRY_HOURS: int = 24

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_USERNAME: str = "default"
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = 0
    REDIS_TLS: bool = False

    # Umami
    UMAMI_ENDPOINT: str = ""
    UMAMI_USERNAME: str = ""
    UMAMI_PASSWORD: str = ""
    UMAMI_WEBSITE_ID: str = "b7c4ef4e-f035-4e47-9db1-280046d63543"

    # Meta (Facebook) Ads API
    META_ADS_ACCESS_TOKEN: str = ""
    META_ADS_ACCOUNT_ID: str = ""

    # Demo mode — this copy of the codebase is a sales-demo deployment.
    # When true: the cron scheduler stays off (nothing pulls from PROD_DB,
    # Umami, or Meta) and the live Meta Pixel Events endpoint serves
    # generated fixture data instead of calling the real Meta API.
    DEMO_MODE: bool = False

    @property
    def analytics_db_url(self) -> str:
        """Build asyncpg URL, handling special chars in password."""
        if self.ANALYTICS_DB:
            url = self.ANALYTICS_DB
            if url.startswith("postgresql://"):
                url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
            return url
        # Build from separate fields
        pwd = quote_plus(self.DB_PASSWORD) if self.DB_PASSWORD else ""
        auth = f"{self.DB_USER}:{pwd}@" if self.DB_USER else ""
        return f"postgresql+asyncpg://{auth}{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def analytics_db_sync_url(self) -> str:
        """Sync URL for raw SQL operations."""
        url = self.ANALYTICS_DB
        if url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
        return url

    @property
    def prod_db_url(self) -> str:
        """Convert standard postgres:// URL to asyncpg URL."""
        url = self.PROD_DB
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @property
    def redis_url(self) -> str:
        protocol = "rediss" if self.REDIS_TLS else "redis"
        auth_part = f"{self.REDIS_USERNAME}:{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        return f"{protocol}://{auth_part}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
