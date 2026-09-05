"""Redis service — port of NestJS redis.service.ts using redis.asyncio."""

import logging
import json
from typing import Any, Optional
import redis.asyncio as aioredis
from app.config import get_settings

logger = logging.getLogger(__name__)

_redis_client: Optional[aioredis.Redis] = None


async def init_redis() -> aioredis.Redis:
    global _redis_client
    settings = get_settings()
    _redis_client = aioredis.from_url(
        settings.redis_url,
        decode_responses=True,
    )
    try:
        await _redis_client.ping()
        logger.info("Redis service initialized and connected")
    except Exception as e:
        logger.error(f"Redis connection error: {e}")
    return _redis_client


async def close_redis():
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        logger.info("Disconnected from Redis")
        _redis_client = None


def get_redis() -> aioredis.Redis:
    if _redis_client is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return _redis_client


async def redis_get(key: str) -> Any:
    r = get_redis()
    val = await r.get(key)
    if val is not None:
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    return None


async def redis_set(key: str, value: Any, ttl: int | None = None) -> bool:
    r = get_redis()
    serialized = json.dumps(value) if not isinstance(value, str) else value
    if ttl:
        await r.setex(key, ttl, serialized)
    else:
        await r.set(key, serialized)
    return True


async def redis_delete(key: str) -> bool:
    r = get_redis()
    result = await r.delete(key)
    return result > 0


async def redis_clear():
    r = get_redis()
    await r.flushdb()


async def redis_has(key: str) -> bool:
    r = get_redis()
    return await r.exists(key) > 0
