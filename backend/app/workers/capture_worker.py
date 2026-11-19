import queue
import threading
import time

import cv2
import structlog

from app.services.stream_url import normalize_stream_url

log = structlog.get_logger()


class CaptureWorker(threading.Thread):
    """Reads frames from an RTSP stream and puts them into a queue for detection."""

    def __init__(self, camera_id: int, rtsp_url: str, fps_limit: int, frame_queue: queue.Queue):
        super().__init__(daemon=True, name=f"capture-{camera_id}")
        self.camera_id = camera_id
        self.rtsp_url = normalize_stream_url(rtsp_url)
        self.fps_limit = max(1, fps_limit)
        self.frame_queue = frame_queue
        self._stop_event = threading.Event()

    def run(self):
        frame_interval = 1.0 / self.fps_limit
        reconnect_delay = 1.0

        while not self._stop_event.is_set():
            cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)

            if not cap.isOpened():
                log.warning("rtsp_open_failed", camera_id=self.camera_id, retry_in=reconnect_delay)
                cap.release()
                self._stop_event.wait(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2, 30.0)
                continue

            reconnect_delay = 1.0
            log.info("rtsp_connected", camera_id=self.camera_id, url=self.rtsp_url)
            last_frame_time = 0.0

            while not self._stop_event.is_set():
                ret, frame = cap.read()
                if not ret or frame is None:
                    log.warning("rtsp_read_failed", camera_id=self.camera_id)
                    break

                now = time.monotonic()
                if now - last_frame_time < frame_interval:
                    continue
                last_frame_time = now

                try:
                    self.frame_queue.put_nowait(frame)
                except queue.Full:
                    # Drop old frame, replace with current
                    try:
                        self.frame_queue.get_nowait()
                    except queue.Empty:
                        pass
                    try:
                        self.frame_queue.put_nowait(frame)
                    except queue.Full:
                        pass

            cap.release()
            if not self._stop_event.is_set():
                log.info("rtsp_reconnecting", camera_id=self.camera_id, delay=reconnect_delay)
                self._stop_event.wait(reconnect_delay)

    def stop(self):
        self._stop_event.set()
