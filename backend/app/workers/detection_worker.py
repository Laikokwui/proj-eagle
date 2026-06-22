import asyncio
import queue
import threading
import time

import cv2
import structlog

log = structlog.get_logger()


class DetectionWorker(threading.Thread):
    """Pulls frames from the capture queue, runs YOLO inference, publishes results to Redis."""

    def __init__(self, camera_id: int, loop: asyncio.AbstractEventLoop):
        super().__init__(daemon=True, name=f"detect-{camera_id}")
        self.camera_id = camera_id
        self.frame_queue: queue.Queue = queue.Queue(maxsize=2)
        self._stop_event = threading.Event()
        self._model = None
        self._model_path: str | None = None
        # Backoff tracking for failed model loads — prevents blocking the thread
        # every frame when a model is broken/incompatible.
        self._failed_path: str | None = None
        self._retry_after: float = 0.0
        self._loop = loop

    def _get_or_load_model(self):
        from app.services.detection_service import detection_service
        current_path = detection_service.get_model_path()
        if not current_path:
            return self._model
        if current_path == self._model_path:
            return self._model  # already loaded successfully
        # Still in backoff for this path — skip and stream raw frames
        if current_path == self._failed_path and time.monotonic() < self._retry_after:
            return None
        try:
            from ultralytics import YOLO
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            self._model = YOLO(current_path)
            self._model.to(device)
            self._model_path = current_path
            self._failed_path = None
            log.info("model_loaded", camera_id=self.camera_id, path=current_path, device=device)
        except Exception as e:
            log.error("model_load_error", camera_id=self.camera_id, error=str(e))
            self._model = None
            self._model_path = None
            self._failed_path = current_path
            self._retry_after = time.monotonic() + 30.0  # back off 30 s before retrying
        return self._model

    def _publish_frame_sync(self, jpeg_bytes: bytes):
        if self._loop and not self._loop.is_closed():
            from app.services.stream_service import publish_frame
            asyncio.run_coroutine_threadsafe(publish_frame(self.camera_id, jpeg_bytes), self._loop)

    def _publish_detection_status_sync(self, detected: list[str], violations: list[str]):
        if self._loop and not self._loop.is_closed():
            from app.services.stream_service import publish_detection_status
            asyncio.run_coroutine_threadsafe(
                publish_detection_status(self.camera_id, detected, violations), self._loop
            )

    def _save_violation_sync(self, frame, missing_classes: list[str], confidence: float, camera_name: str, ai_model_id):
        if self._loop and not self._loop.is_closed():
            from app.services.alert_service import save_violation
            asyncio.run_coroutine_threadsafe(
                save_violation(self.camera_id, camera_name, ai_model_id, frame, missing_classes, confidence),
                self._loop,
            )

    def run(self):
        last_violation_time = 0.0
        violation_cooldown = 5.0  # seconds between consecutive violations per camera

        while not self._stop_event.is_set():
            try:
                frame = self.frame_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            model = self._get_or_load_model()
            if model is None:
                # No model loaded — still stream raw frame
                _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                self._publish_frame_sync(buf.tobytes())
                continue

            try:
                from app.config import settings
                results = model.predict(frame, conf=settings.detection_confidence, verbose=False)
                result = results[0]
                annotated = result.plot()

                _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 75])
                self._publish_frame_sync(buf.tobytes())

                all_names = model.names
                if result.boxes is not None and len(result.boxes) > 0:
                    detected_class_ids = set(result.boxes.cls.cpu().numpy().astype(int).tolist())
                    detected_names = [all_names[cid] for cid in detected_class_ids if cid in all_names]
                    now = time.monotonic()
                    missing = self._check_violations(result, all_names)
                    self._publish_detection_status_sync(detected_names, missing)
                    if missing and now - last_violation_time > violation_cooldown:
                        last_violation_time = now
                        conf = float(result.boxes.conf.mean().item()) if len(result.boxes.conf) > 0 else 0.0
                        self._save_violation_sync(annotated, missing, conf, f"Camera {self.camera_id}", None)
                else:
                    self._publish_detection_status_sync([], [])

            except Exception as e:
                log.error("inference_error", camera_id=self.camera_id, error=str(e))
                # Publish the raw frame so the stream doesn't freeze on inference errors
                _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                self._publish_frame_sync(buf.tobytes())

    @staticmethod
    def _normalize(s: str) -> str:
        return s.lower().replace("-", " ").replace("_", " ").strip()

    def _check_violations(self, result, names: dict) -> list[str]:
        from app.services.detection_service import detection_service
        if not result.boxes:
            return []

        detected_ids = set(result.boxes.cls.cpu().numpy().astype(int).tolist())
        detected_names = {names[cid] for cid in detected_ids if cid in names}
        detected_norm = {self._normalize(n) for n in detected_names}

        # Primary: text-based rules configured by admin
        configured_names = detection_service.get_violation_class_names()
        if configured_names:
            return [cn for cn in configured_names if self._normalize(cn) in detected_norm]

        # Legacy: ID-based rules
        configured_ids = set(detection_service.get_violation_class_ids())
        if configured_ids:
            return [names[cid] for cid in configured_ids if cid in detected_ids and cid in names]

        # Auto-detect fallback: look for "no-helmet" style class names in the model
        no_ppe_keywords = {"no helmet", "no vest", "no hardhat", "no glove", "no mask",
                           "no goggles", "no boots", "no ppe"}
        return [
            cls_name for cls_name in detected_names
            if self._normalize(cls_name) in no_ppe_keywords
        ]

    def stop(self):
        self._stop_event.set()
