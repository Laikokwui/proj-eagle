"""Audit items: request-scoped DB session leaking into background download,
blocking HTTP client, duplicate downloads, hanging SSE progress, upload size.
"""

import asyncio
import json
import time
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

import app.routers.models as models_router
from app.config import settings
from app.core.dependencies import get_current_user
from app.core.security import create_access_token
from app.database import AsyncSessionLocal, get_db
from app.main import app
from app.schemas.ai_model import AIModelDownloadRequest
from app.services import model_service  # module (for constants)
from app.services.model_service import model_service as model_service_singleton


def _capture_background_tasks(monkeypatch):
    """Capture create_task calls so the request can finish (and its session
    can close) before the background coroutine is awaited deterministically."""
    captured = []
    monkeypatch.setattr(
        models_router,
        "asyncio",
        SimpleNamespace(create_task=lambda coroutine: (captured.append(coroutine), None)[1]),
    )
    return captured


class TestDownloadLifecycle:
    def test_duplicate_download_is_rejected(self, client, monkeypatch, model_server):
        """Simultaneous downloads of the same model must not race on one file."""
        model_server()
        captured = _capture_background_tasks(monkeypatch)
        payload = {"source": "ultralytics", "model_id": "yolov8n"}

        try:
            first = client.post("/api/models/download", json=payload)
            second = client.post("/api/models/download", json=payload)
        finally:
            for coroutine in captured:
                coroutine.close()

        assert first.status_code == 202
        assert second.status_code in (200, 202, 409)
        if second.status_code != 409:
            assert second.json()["task_id"] == first.json()["task_id"]

    async def test_download_survives_request_session_close(
        self, client, monkeypatch, model_server, fake_redis, admin_user
    ):
        """The background task outlives the request; it must own its DB
        session and still finish with status 'completed'."""
        model_server()
        captured = _capture_background_tasks(monkeypatch)

        class BrokenRequestSession:
            """A request-scoped session that is truly unusable once the
            request has finished. A correct background task must not touch it."""
            def add(self, *args, **kwargs):
                raise RuntimeError("request session is closed")

            async def commit(self, *args, **kwargs):
                raise RuntimeError("request session is closed")

            async def flush(self, *args, **kwargs):
                raise RuntimeError("request session is closed")

            async def close(self):
                pass

        async def closing_db():
            yield BrokenRequestSession()

        app.dependency_overrides[get_db] = closing_db
        app.dependency_overrides[get_current_user] = lambda: admin_user
        try:
            response = client.post(
                "/api/models/download",
                json={"source": "ultralytics", "model_id": "yolov8n"},
            )
            assert response.status_code == 202
            assert captured, "download task was never scheduled"
            await captured[0]
        finally:
            app.dependency_overrides.pop(get_db, None)

        statuses = [
            json.loads(message)["status"]
            for channel, message in fake_redis.published
            if channel.startswith("model_download_progress:")
        ]
        assert "completed" in statuses

    async def test_download_does_not_block_the_event_loop(self, model_server, monkeypatch):
        """While weights download, unrelated async work must keep running."""
        model_server(delay=0.6)

        def blocking_get(url, **kwargs):
            time.sleep(0.6)
            return SimpleNamespace(
                headers={"content-length": "1536"},
                iter_content=lambda chunk_size: [b"x" * 512] * 3,
                raise_for_status=lambda: None,
            )

        monkeypatch.setattr(
            model_service, "requests", SimpleNamespace(get=blocking_get), raising=False
        )
        req = AIModelDownloadRequest(source="ultralytics", model_id="yolov8n")

        async with AsyncSessionLocal() as db:
            task = asyncio.create_task(model_service_singleton.download_model("heartbeat-test", req, db))
            loop = asyncio.get_running_loop()
            gaps = []
            previous = loop.time()
            for _ in range(60):
                await asyncio.sleep(0.01)
                now = loop.time()
                gaps.append(now - previous)
                previous = now
            await task

        worst_gap = max(gaps)
        assert worst_gap < 0.2, f"event loop stalled for {worst_gap:.2f}s during download"

    async def test_unknown_download_task_terminates_and_accepts_token(self):
        """EventSource cannot send an Authorization header; the endpoint must
        accept a token query param and close the stream for unknown tasks."""
        token = create_access_token("admin")

        async def read_stream():
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as async_client:
                async with async_client.stream(
                    "GET", f"/api/models/download-progress/does-not-exist?token={token}"
                ) as response:
                    assert response.status_code == 200
                    return (await response.aread()).decode()

        try:
            body = await asyncio.wait_for(read_stream(), timeout=3)
        except asyncio.TimeoutError:
            pytest.fail("SSE stream hung for an unknown task id")

        assert '"status":"error"' in body.replace(" ", "")


class TestUploadLimits:
    def test_oversized_upload_is_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings, "max_upload_mb", 1)
        oversized = b"x" * (2 * 1024 * 1024)

        response = client.post(
            "/api/models/upload",
            files={"file": ("model.pt", oversized, "application/octet-stream")},
            data={"name": "big model"},
        )

        assert response.status_code == 413

    def test_small_valid_upload_still_works(self, client, monkeypatch):
        monkeypatch.setattr(settings, "max_upload_mb", 1)

        response = client.post(
            "/api/models/upload",
            files={"file": ("model.pt", b"tiny", "application/octet-stream")},
            data={"name": "small model"},
        )

        assert response.status_code == 201
        assert response.json()["name"] == "small model"
