import asyncio
import structlog
from app.redis_client import get_redis

log = structlog.get_logger()


async def publish_frame(camera_id: int, jpeg_bytes: bytes) -> None:
    try:
        redis = await get_redis()
        await redis.publish(f"camera:{camera_id}:frames", jpeg_bytes)
    except Exception as e:
        log.debug("frame_publish_error", camera_id=camera_id, error=str(e))
