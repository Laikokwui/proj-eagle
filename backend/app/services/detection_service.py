import threading
import structlog
from app.redis_client import get_redis

log = structlog.get_logger()


class DetectionService:
    """Manages the active YOLO model and violation rules, broadcasts reload signals to workers."""

    def __init__(self):
        self._active_model_path: str | None = None
        self._violation_class_ids: list[int] = []
        self._violation_class_names: list[str] = []
        self._lock = threading.Lock()

    def get_model_path(self) -> str | None:
        with self._lock:
            return self._active_model_path

    def get_violation_class_ids(self) -> list[int]:
        with self._lock:
            return list(self._violation_class_ids)

    def get_violation_class_names(self) -> list[str]:
        with self._lock:
            return list(self._violation_class_names)

    def set_active_model(
        self,
        path: str,
        violation_class_ids: list[int] | None = None,
        violation_class_names: list[str] | None = None,
    ) -> None:
        with self._lock:
            self._active_model_path = path
            self._violation_class_ids = list(violation_class_ids or [])
            self._violation_class_names = list(violation_class_names or [])

    def set_model_path(self, path: str) -> None:
        self.set_active_model(path, [], [])

    async def reload_model(
        self,
        model_path: str,
        violation_class_ids: list[int] | None = None,
        violation_class_names: list[str] | None = None,
    ) -> None:
        self.set_active_model(model_path, violation_class_ids, violation_class_names)
        redis = await get_redis()
        await redis.publish("model:reload", model_path)
        log.info("model_reload_signal_sent", path=model_path,
                 violation_classes=len(violation_class_names or violation_class_ids or []))


detection_service = DetectionService()
