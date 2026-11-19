import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

import cv2
import structlog

from app.config import settings
from app.redis_client import get_redis

log = structlog.get_logger()


async def save_violation(
    camera_id: int,
    camera_name: str,
    ai_model_id: int | None,
    frame,
    missing_classes: list[str],
    confidence: float,
) -> None:
    os.makedirs(settings.screenshots_dir, exist_ok=True)
    filename = f"{uuid.uuid4()}.jpg"
    filepath = os.path.join(settings.screenshots_dir, filename)

    try:
        if not cv2.imwrite(filepath, frame, [cv2.IMWRITE_JPEG_QUALITY, 85]):
            log.error("screenshot_save_error", path=filepath, reason="imwrite returned False")
            filepath = None
    except Exception as e:
        log.error("screenshot_save_error", error=str(e))
        filepath = None

    # Insert violation via a raw DB call in a background thread
    # (called from sync detection worker context)
    from app.database import AsyncSessionLocal
    from app.models.violation import Violation

    async with AsyncSessionLocal() as db:
        v = Violation(
            camera_id=camera_id,
            ai_model_id=ai_model_id,
            screenshot_path=filepath,
            missing_classes=missing_classes,
            detection_conf=round(confidence, 4),
            acknowledged=False,
            occurred_at=datetime.now(timezone.utc),
        )
        db.add(v)
        await db.commit()
        await db.refresh(v)

    # Publish alert to Redis
    alert = {
        "violation_id": v.id,
        "camera_id": camera_id,
        "camera_name": camera_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "missing_ppe": missing_classes,
        "screenshot_url": f"/screenshots/{filename}" if filepath else None,
    }
    try:
        redis = await get_redis()
        await redis.publish("alerts", json.dumps(alert))
    except Exception as e:
        log.error("alert_publish_error", error=str(e))
