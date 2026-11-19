"""Credential-aware Hugging Face and Ultralytics download paths."""

from types import SimpleNamespace

import huggingface_hub
import pytest

from app.schemas.ai_model import AIModelDownloadRequest
from app.services import model_service as model_service_module
from app.services.model_service import model_service as service


HF_TOKEN = "hf_abcdefghijklmnopqrstuvwxyz1234"
UL_KEY = "ul_" + "a" * 40


class TestHuggingFaceCredentials:
    def test_search_passes_saved_token(self, client, monkeypatch):
        captured = {}
        client.put("/api/integrations/credentials/huggingface", json={"token": HF_TOKEN})

        def fake_list_models(**kwargs):
            captured.update(kwargs)
            return []

        monkeypatch.setattr(huggingface_hub, "list_models", fake_list_models)

        assert client.get("/api/models/huggingface/search?q=yolo").status_code == 200
        assert captured["token"] == HF_TOKEN

    def test_search_401_is_actionable_and_does_not_leak_token(self, client, monkeypatch):
        client.put("/api/integrations/credentials/huggingface", json={"token": HF_TOKEN})

        def unauthorized(**kwargs):
            raise RuntimeError(f"401 Unauthorized for token {HF_TOKEN}")

        monkeypatch.setattr(huggingface_hub, "list_models", unauthorized)

        response = client.get("/api/models/huggingface/search?q=gated")
        detail = response.json()["detail"]

        assert response.status_code == 502
        assert "Settings" in detail
        assert "401" in detail
        assert HF_TOKEN not in detail

    async def test_download_passes_saved_token(self, client, monkeypatch, fake_redis):
        client.put("/api/integrations/credentials/huggingface", json={"token": HF_TOKEN})
        captured = {}

        def fake_download(**kwargs):
            captured.update(kwargs)
            return "fake-model.pt"

        async def fake_finalize(task_id, req, dest_path, db, publish):
            await publish("completed", 100, "done")

        monkeypatch.setattr(huggingface_hub, "hf_hub_download", fake_download)
        monkeypatch.setattr(service, "_finalize_model", fake_finalize)

        await service.download_model(
            "hf-token-task", AIModelDownloadRequest(source="huggingface", model_id="org/ppe")
        )

        assert captured["repo_id"] == "org/ppe"
        assert captured["token"] == HF_TOKEN
        assert json_status(fake_redis, "hf-token-task") == "completed"


class TestUltralyticsPlatform:
    async def test_platform_download_uses_saved_api_key(self, client, monkeypatch, fake_redis):
        client.put("/api/integrations/credentials/ultralytics", json={"token": UL_KEY})
        captured = {}

        class FilesResponse:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "files": [
                        {"name": "notes.txt", "size": 1, "downloadUrl": "https://cdn.example/notes"},
                        {"name": "best.pt", "size": 4, "downloadUrl": "https://cdn.example/best.pt"},
                    ]
                }

        class StreamResponse:
            status_code = 200
            headers = {"content-length": "4"}

            def raise_for_status(self):
                return None

            async def aiter_bytes(self, chunk_size):
                yield b"fake"

        class FakeStream:
            async def __aenter__(self):
                return StreamResponse()

            async def __aexit__(self, *args):
                return False

        class FakeClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def get(self, url, headers=None):
                captured["files_url"] = url
                captured["headers"] = headers
                return FilesResponse()

            def stream(self, method, url):
                captured["stream_url"] = url
                return FakeStream()

        async def fake_finalize(task_id, req, dest_path, db, publish):
            await publish("completed", 100, "done")

        monkeypatch.setattr(
            model_service_module, "httpx", SimpleNamespace(AsyncClient=FakeClient)
        )
        monkeypatch.setattr(service, "_finalize_model", fake_finalize)

        ref = "acme-vision/inspection/best-model"
        await service.download_model(
            "ul-platform-task", AIModelDownloadRequest(source="ultralytics", model_id=ref)
        )

        assert captured["files_url"].endswith("/api/models/acme-vision/inspection/best-model/files")
        assert captured["headers"]["Authorization"] == f"Bearer {UL_KEY}"
        assert captured["stream_url"] == "https://cdn.example/best.pt"
        assert json_status(fake_redis, "ul-platform-task") == "completed"

    async def test_platform_model_without_key_publishes_actionable_error(
        self, client, monkeypatch, fake_redis
    ):
        client.delete("/api/integrations/credentials/ultralytics")

        async def fake_finalize(*args, **kwargs):
            pytest.fail("finalize should not run without a credential")

        monkeypatch.setattr(service, "_finalize_model", fake_finalize)

        await service.download_model(
            "ul-no-key-task",
            AIModelDownloadRequest(source="ultralytics", model_id="acme-vision/inspection/best"),
        )

        message = json_message(fake_redis, "ul-no-key-task")
        assert json_status(fake_redis, "ul-no-key-task") == "error"
        assert "API key" in message
        assert "Settings" in message


def json_status(fake_redis, task_id):
    import json

    payload = fake_redis.store[f"model_download:{task_id}"]
    return json.loads(payload)["status"]


def json_message(fake_redis, task_id):
    import json

    payload = fake_redis.store[f"model_download:{task_id}"]
    return json.loads(payload)["message"]
