import asyncio
import threading
import structlog
from app.redis_client import get_redis

log = structlog.get_logger()


class DetectionService:
    """Manages the active YOLO model path and broadcasts reload signals to workers."""

    def __init__(self):
        self._active_model_path: str | None = None
        self._lock = threading.Lock()

    def get_model_path(self) -> str | None:
        with self._lock:
            return self._active_model_path

    def set_model_path(self, path: str) -> None:
        with self._lock:
            self._active_model_path = path

    async def reload_model(self, model_path: str) -> None:
        self.set_model_path(model_path)
        redis = await get_redis()
        await redis.publish("model:reload", model_path)
        log.info("model_reload_signal_sent", path=model_path)


detection_service = DetectionService()
