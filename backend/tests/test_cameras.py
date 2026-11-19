"""Audit items: SSRF in test-url, inactive camera can stream, orphaned
screenshots after camera deletion, plus boundary inputs for camera routes.
"""

import queue
from types import SimpleNamespace
from unittest.mock import AsyncMock

import app.routers.cameras as cameras_router
import app.workers.capture_worker as capture_worker_module
from app.main import app
from app.services.camera_service import camera_manager
from app.workers.capture_worker import CaptureWorker
from tests.conftest import add_camera, add_violation


class TestStreamUrlValidation:
    def test_test_url_rejects_loopback_address(self, client):
        """The server must not be usable to probe internal services."""
        response = client.post(
            "/api/cameras/test-url",
            json={"rtsp_url": "rtsp://127.0.0.1:554/stream"},
        )
        assert response.status_code == 400

    def test_test_url_rejects_localhost_hostname(self, client):
        response = client.post(
            "/api/cameras/test-url",
            json={"rtsp_url": "http://localhost:8080/video"},
        )
        assert response.status_code == 400

    def test_test_url_accepts_public_camera_url(self, client):
        """Valid business case must keep working after validation is added."""
        response = client.post(
            "/api/cameras/test-url",
            json={"rtsp_url": "rtsp://cam.example.com:554/stream"},
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_test_url_rejects_empty_and_unsupported_inputs(self, client):
        assert client.post("/api/cameras/test-url", json={}).status_code in (200, 400)
        invalid = client.post(
            "/api/cameras/test-url",
            json={"rtsp_url": "file:///etc/passwd"},
        )
        assert invalid.status_code == 400


class TestCameraLifecycle:
    async def test_inactive_camera_cannot_start_stream(self, client, monkeypatch):
        """is_active=False is a business rule, not a decorative flag."""
        camera_id = await add_camera(is_active=False)
        start_mock = AsyncMock()
        monkeypatch.setattr(camera_manager, "start_stream", start_mock)

        response = client.post(f"/api/cameras/{camera_id}/start")

        assert response.status_code == 400
        start_mock.assert_not_awaited()

    async def test_active_camera_can_start_stream(self, client, monkeypatch):
        camera_id = await add_camera(is_active=True)
        monkeypatch.setattr(camera_manager, "start_stream", AsyncMock())

        response = client.post(f"/api/cameras/{camera_id}/start")

        assert response.status_code == 200
        assert response.json()["is_streaming"] is True

    async def test_deleting_camera_removes_its_screenshots(self, client, tmp_path):
        """Deleting a camera must not leave violation screenshots on disk."""
        camera_id = await add_camera()
        screenshot = tmp_path / "evidence.jpg"
        screenshot.write_bytes(b"jpeg")
        await add_violation(camera_id=camera_id, screenshot_path=str(screenshot))

        response = client.delete(f"/api/cameras/{camera_id}")

        assert response.status_code == 204
        assert not screenshot.exists()

    async def test_delete_unknown_camera_is_404(self, client):
        assert client.delete("/api/cameras/999999").status_code == 404


class TestEmptyPortStreamUrls:
    """FFmpeg rejects 'rtsp://host:/path' with 'Port missing in uri'.

    A genuinely portless URL is fine (FFmpeg defaults to 554/80); the broken
    form is a trailing colon with no port after it. Both the connection test
    and the live capture worker must hand OpenCV a usable URL.
    """

    @staticmethod
    def _record_capture_urls(monkeypatch, *, opened=True):
        calls = []

        def factory(url, *args, **kwargs):
            calls.append(url)
            return SimpleNamespace(
                set=lambda *a: None,
                isOpened=lambda: opened,
                read=lambda: (True, object()),
                release=lambda: None,
            )

        # Patch the module object the router actually holds: conftest is
        # imported under two names, so a plain `import cv2` can be a different
        # stub than the one bound in app.routers.cameras.
        monkeypatch.setattr(cameras_router.cv2, "VideoCapture", factory)
        return calls

    def test_test_url_strips_empty_rtsp_port(self, client, monkeypatch):
        calls = self._record_capture_urls(monkeypatch)

        response = client.post("/api/cameras/test-url", json={"rtsp_url": "rtsp://cam.example.com:/stream"})

        assert response.status_code == 200
        assert response.json()["success"] is True
        assert calls == ["rtsp://cam.example.com/stream"]

    def test_test_url_strips_empty_http_port(self, client, monkeypatch):
        calls = self._record_capture_urls(monkeypatch)

        response = client.post("/api/cameras/test-url", json={"rtsp_url": "http://cam.example.com:/video"})

        assert response.status_code == 200
        assert response.json()["success"] is True
        assert calls == ["http://cam.example.com/video"]

    def test_test_url_keeps_explicit_port(self, client, monkeypatch):
        calls = self._record_capture_urls(monkeypatch)

        response = client.post("/api/cameras/test-url", json={"rtsp_url": "rtsp://cam.example.com:554/stream"})

        assert response.status_code == 200
        assert calls == ["rtsp://cam.example.com:554/stream"]

    def test_test_url_preserves_credentials_and_ipv6(self, client, monkeypatch):
        calls = self._record_capture_urls(monkeypatch)

        urls = [
            "rtsp://user:pass@cam.example.com:/stream",
            "rtsp://[2606:4700:4700::1111]:/stream",
        ]
        for url in urls:
            response = client.post("/api/cameras/test-url", json={"rtsp_url": url})
            assert response.status_code == 200, response.text

        assert calls == [
            "rtsp://user:pass@cam.example.com/stream",
            "rtsp://[2606:4700:4700::1111]/stream",
        ]

    def test_capture_worker_strips_empty_port(self, monkeypatch):
        worker = CaptureWorker(7, "rtsp://cam.example.com:/stream", 5, queue.Queue())
        calls = []

        def factory(url, *args, **kwargs):
            calls.append(url)
            worker._stop_event.set()  # let the first loop iteration finish, then exit
            return SimpleNamespace(set=lambda *a: None, isOpened=lambda: False, release=lambda: None)

        monkeypatch.setattr(capture_worker_module.cv2, "VideoCapture", factory)

        worker.run()

        assert calls == ["rtsp://cam.example.com/stream"]

    async def test_create_camera_stores_normalized_url(self, client):
        response = client.post(
            "/api/cameras",
            json={"name": "Gate B", "rtsp_url": "rtsp://cam.example.com:/stream"},
        )
        assert response.status_code == 201
        assert response.json()["rtsp_url"] == "rtsp://cam.example.com/stream"
