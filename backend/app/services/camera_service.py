import asyncio
import threading
from app.models.camera import Camera
from app.workers.capture_worker import CaptureWorker
from app.workers.detection_worker import DetectionWorker


class CameraStreamManager:
    def __init__(self):
        self._capture_workers: dict[int, CaptureWorker] = {}
        self._detection_workers: dict[int, DetectionWorker] = {}
        self._lock = threading.Lock()

    async def start_stream(self, camera: Camera) -> None:
        camera_id = camera.id
        with self._lock:
            if camera_id in self._capture_workers:
                return

            detection = DetectionWorker(camera_id, asyncio.get_running_loop())
            capture = CaptureWorker(camera_id, camera.rtsp_url, camera.fps_limit, detection.frame_queue)

            detection.start()
            capture.start()

            self._capture_workers[camera_id] = capture
            self._detection_workers[camera_id] = detection

    async def stop_stream(self, camera_id: int) -> None:
        with self._lock:
            capture = self._capture_workers.pop(camera_id, None)
            detection = self._detection_workers.pop(camera_id, None)

        if capture:
            capture.stop()
        if detection:
            detection.stop()

    def is_streaming(self, camera_id: int) -> bool:
        return camera_id in self._capture_workers

    async def stop_all(self) -> None:
        ids = list(self._capture_workers.keys())
        for camera_id in ids:
            await self.stop_stream(camera_id)


camera_manager = CameraStreamManager()
