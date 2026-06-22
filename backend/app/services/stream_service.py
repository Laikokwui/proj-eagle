import asyncio
import json
import structlog
from app.redis_client import get_redis

log = structlog.get_logger()


async def publish_frame(camera_id: int, jpeg_bytes: bytes) -> None:
    try:
        redis = await get_redis()
        await redis.publish(f"camera:{camera_id}:frames", jpeg_bytes)
    except Exception as e:
        log.debug("frame_publish_error", camera_id=camera_id, error=str(e))


async def publish_detection_status(camera_id: int, detected_classes: list[str], violation_classes: list[str]) -> None:
    try:
        redis = await get_redis()
        payload = json.dumps({"detected": detected_classes, "violations": violation_classes})
        await redis.set(f"camera:{camera_id}:last_detection", payload, ex=15)
    except Exception as e:
        log.debug("detection_status_error", camera_id=camera_id, error=str(e))
