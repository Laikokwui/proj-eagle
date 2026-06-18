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
        self._loop = loop

    def _get_or_load_model(self):
        from app.services.detection_service import detection_service
        current_path = detection_service.get_model_path()
        if current_path and current_path != self._model_path:
            try:
                from ultralytics import YOLO
                import torch
                device = "cuda" if torch.cuda.is_available() else "cpu"
                self._model = YOLO(current_path)
                self._model.to(device)
                self._model_path = current_path
                log.info("model_loaded", camera_id=self.camera_id, path=current_path, device=device)
            except Exception as e:
                log.error("model_load_error", camera_id=self.camera_id, error=str(e))
                self._model = None
        return self._model

    def _publish_frame_sync(self, jpeg_bytes: bytes):
        if self._loop and not self._loop.is_closed():
            from app.services.stream_service import publish_frame
            asyncio.run_coroutine_threadsafe(publish_frame(self.camera_id, jpeg_bytes), self._loop)

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

                # Encode and stream
                _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 75])
                self._publish_frame_sync(buf.tobytes())

                # Check for violations
                if result.boxes is not None and len(result.boxes) > 0:
                    from app.services.detection_service import detection_service
                    # Get model's ppe_class_ids from DB (cached via detection_service or direct lookup)
                    detected_class_ids = set(result.boxes.cls.cpu().numpy().astype(int).tolist())
                    # Use model names for classes
                    all_names = model.names  # {0: 'person', 1: 'helmet', ...}

                    # Simple heuristic: if model has PPE-related classes, check for their absence
                    # The class IDs to enforce are configured per-model in the DB
                    # Here we just detect what's present and publish raw detections
                    # Actual violation logic uses ppe_class_ids from the DB record

                    now = time.monotonic()
                    if now - last_violation_time > violation_cooldown:
                        # Check if any person is detected without required PPE
                        # This is a simplified check — full logic requires ppe_class_ids from DB
                        missing = self._check_violations(result, all_names)
                        if missing:
                            last_violation_time = now
                            conf = float(result.boxes.conf.mean().item()) if len(result.boxes.conf) > 0 else 0.0
                            self._save_violation_sync(annotated, missing, conf, f"Camera {self.camera_id}", None)

            except Exception as e:
                log.error("inference_error", camera_id=self.camera_id, error=str(e))

    def _check_violations(self, result, names: dict) -> list[str]:
        """
        Returns list of missing PPE class names.
        Looks for PPE-specific classes in model names and checks if they're absent.
        """
        ppe_keywords = {"helmet", "hardhat", "hard_hat", "vest", "glove", "glasses", "mask", "boot", "ppe"}
        no_ppe_keywords = {"no-helmet", "no_helmet", "no-vest", "no_vest", "no-hardhat", "no_hardhat",
                           "no-glove", "no_glove", "no-mask", "no_mask"}

        detected_class_ids = set(result.boxes.cls.cpu().numpy().astype(int).tolist()) if result.boxes else set()
        missing = []

        for class_id, class_name in names.items():
            lower = class_name.lower()
            if any(kw in lower for kw in no_ppe_keywords):
                if class_id in detected_class_ids:
                    missing.append(class_name)

        return missing

    def stop(self):
        self._stop_event.set()
