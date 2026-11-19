"""Test harness for the PPE backend.

Heavy/optional runtime dependencies (OpenCV, Ultralytics, Torch, requests,
HuggingFace) are replaced with deterministic stubs *before* the app is
imported. Redis is an in-memory fake; PostgreSQL is replaced by a temporary
SQLite database. No external service is contacted by these tests.
"""

import asyncio
import os
import sys
import tempfile
import threading
import time
import types
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

# ---------------------------------------------------------------------------
# Stub modules (must happen before any `app.*` import)
# ---------------------------------------------------------------------------


def _fake_module(name, **attrs):
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    sys.modules[name] = module
    return module


class _FakeYOLO:
    def __init__(self, path):
        self.names = {0: "person", 1: "no helmet"}

    def to(self, device):
        return self

    def predict(self, *args, **kwargs):
        return []


cv2_stub = _fake_module("cv2")
cv2_stub.CAP_FFMPEG = 0
cv2_stub.CAP_PROP_BUFFERSIZE = 0
cv2_stub.CAP_PROP_OPEN_TIMEOUT_MSEC = 0
cv2_stub.CAP_PROP_READ_TIMEOUT_MSEC = 0
cv2_stub.IMWRITE_JPEG_QUALITY = 0
cv2_stub.imwrite = MagicMock(return_value=True)
cv2_stub.imencode = MagicMock(return_value=(True, SimpleNamespace(tobytes=lambda: b"jpeg-bytes")))
cv2_stub.VideoCapture = MagicMock(
    return_value=SimpleNamespace(
        set=lambda *args: None,
        isOpened=lambda: True,
        read=lambda: (True, object()),
        release=lambda: None,
    )
)

_fake_module("ultralytics", YOLO=_FakeYOLO)
_fake_module("torch", cuda=SimpleNamespace(is_available=lambda: False))
_fake_module(
    "huggingface_hub",
    list_models=MagicMock(return_value=[]),
    hf_hub_download=MagicMock(return_value="model.pt"),
)
requests_stub = _fake_module("requests", get=MagicMock())

# ---------------------------------------------------------------------------
# Configuration: isolated DB / data dir / secrets
# ---------------------------------------------------------------------------

DATA_DIR = tempfile.mkdtemp(prefix="eagle-tests-")
os.environ["DATA_DIR"] = DATA_DIR
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DATA_DIR}/test.db"
os.environ["JWT_SECRET"] = "test-secret-0123456789abcdef0123456789abcdef"
os.environ["CORS_ORIGINS"] = "http://localhost"
os.environ["JWT_EXPIRE_MINUTES"] = "60"

# ---------------------------------------------------------------------------
# App imports (after stubs + env)
# ---------------------------------------------------------------------------

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import Integer, select  # noqa: E402

import app.redis_client as redis_client  # noqa: E402
import app.routers.models as models_router  # noqa: E402
from app.config import settings  # noqa: E402
from app.core.dependencies import get_current_user  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.database import AsyncSessionLocal, Base, engine, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.ai_model import AIModel  # noqa: E402
from app.models.camera import Camera  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.violation import Violation  # noqa: E402
from app.services import model_service  # noqa: E402
from app.services.camera_service import camera_manager  # noqa: E402

# SQLite cannot autoincrement a BigInteger primary key (PostgreSQL can, via
# BIGSERIAL). This test-only tweak keeps insert behaviour equivalent without
# changing production code.
Violation.__table__.c.id.type = Integer()


# ---------------------------------------------------------------------------
# In-memory Redis fake
# ---------------------------------------------------------------------------


class FakePubSub:
    def __init__(self, redis):
        self.redis = redis
        self.channels = set()
        self.queue = asyncio.Queue()

    async def subscribe(self, channel):
        self.channels.add(channel)
        self.redis.subscribers.add(self)

    async def unsubscribe(self, channel):
        self.channels.discard(channel)

    async def listen(self):
        yield {"type": "subscribe", "channel": list(self.channels)}
        while True:
            message = await self.queue.get()
            yield message

    async def aclose(self):
        self.redis.subscribers.discard(self)


class FakeRedis:
    def __init__(self):
        self.store = {}
        self.published = []
        self.subscribers = set()

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, ex=None):
        self.store[key] = value.encode() if isinstance(value, str) else value

    async def delete(self, key):
        self.store.pop(key, None)

    async def publish(self, channel, message):
        self.published.append((channel, message))
        for subscriber in list(self.subscribers):
            if channel in subscriber.channels:
                subscriber.queue.put_nowait({"type": "message", "channel": channel, "data": message})

    async def ping(self):
        return True

    def pubsub(self):
        return FakePubSub(self)

    async def aclose(self):
        pass


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(redis_client, "_redis_pool", redis)
    return redis


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------


async def _create_schema():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


@pytest.fixture(scope="session", autouse=True)
def _schema():
    asyncio.run(_create_schema())


@pytest.fixture(autouse=True)
async def _clean_tables():
    async with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            await connection.execute(table.delete())

    async with AsyncSessionLocal() as db:
        db.add(
            User(
                username="admin",
                email="admin@localhost",
                hashed_password=hash_password("admin123"),
                role="admin",
                is_active=True,
            )
        )
        await db.commit()
    yield


@pytest.fixture
def admin_user():
    return SimpleNamespace(id=1, username="admin", role="admin", is_active=True)


@pytest.fixture
def operator_user():
    return SimpleNamespace(id=2, username="operator", role="operator", is_active=True)


@pytest.fixture
def client(admin_user):
    app.dependency_overrides[get_current_user] = lambda: admin_user
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()
    camera_manager._capture_workers.clear()
    camera_manager._detection_workers.clear()


# ---------------------------------------------------------------------------
# Row helpers
# ---------------------------------------------------------------------------

_violation_id = [1000]


async def add_camera(name="Gate A", rtsp_url="rtsp://cam.example.com/stream", is_active=True, is_streaming=False):
    async with AsyncSessionLocal() as db:
        camera = Camera(name=name, rtsp_url=rtsp_url, is_active=is_active, is_streaming=is_streaming, fps_limit=5)
        db.add(camera)
        await db.commit()
        await db.refresh(camera)
        return camera.id


async def add_model(name="yolov8n", is_active=False):
    async with AsyncSessionLocal() as db:
        model = AIModel(
            name=name,
            source="ultralytics",
            model_id="yolov8n",
            file_path="/tmp/yolov8n.pt",
            class_names=["person", "no helmet"],
            ppe_class_ids=[],
            ppe_class_names=[],
            is_active=is_active,
        )
        db.add(model)
        await db.commit()
        await db.refresh(model)
        return model.id


async def add_violation(
    camera_id=1,
    missing_classes=None,
    occurred_at=None,
    screenshot_path=None,
    detection_conf=0.9,
    acknowledged=False,
    acknowledged_by=None,
):
    _violation_id[0] += 1
    async with AsyncSessionLocal() as db:
        violation = Violation(
            id=_violation_id[0],
            camera_id=camera_id,
            missing_classes=missing_classes or ["no helmet"],
            occurred_at=occurred_at or datetime.now(timezone.utc),
            screenshot_path=screenshot_path,
            detection_conf=detection_conf,
            acknowledged=acknowledged,
            acknowledged_by=acknowledged_by,
        )
        db.add(violation)
        await db.commit()
        return violation.id


@pytest.fixture
async def seed_camera():
    return await add_camera()


# ---------------------------------------------------------------------------
# Slow local model server: both the sync `requests` path and a fixed async
# HTTP client path hit this server, so the event-loop test works pre/post fix.
# ---------------------------------------------------------------------------


@pytest.fixture
def model_server(monkeypatch):
    servers = []

    def start(delay=0.0):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                if delay:
                    time.sleep(delay)
                body = b"fake-weights" * 128
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)
        monkeypatch.setattr(
            model_service,
            "ULTRALYTICS_RELEASE_URL",
            f"http://127.0.0.1:{server.server_port}/{{model_id}}.pt",
        )
        return server

    yield start

    for server in servers:
        server.shutdown()
        server.server_close()
