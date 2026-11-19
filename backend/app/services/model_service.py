import asyncio
import json
import os
import re
from pathlib import Path
from urllib.parse import quote

import httpx
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.secrets import redact_secrets
from app.database import AsyncSessionLocal
from app.models.ai_model import AIModel
from app.schemas.ai_model import AIModelDownloadRequest, HFModelSearchResult
from app.redis_client import get_redis
from app.services.credential_service import credential_service

log = structlog.get_logger()

ULTRALYTICS_RELEASE_URL = "https://github.com/ultralytics/assets/releases/download/v8.3.0/{model_id}.pt"
ULTRALYTICS_PLATFORM_API = "https://platform.ultralytics.com/api"
HF_TOKEN_URL = "https://huggingface.co/settings/tokens"
ULTRALYTICS_KEY_URL = "https://platform.ultralytics.com/account/api-keys"


class ModelCredentialError(RuntimeError):
    """An external model provider rejected or requires credentials."""


def _status_code(exc: Exception) -> int | None:
    for owner in (exc, getattr(exc, "response", None)):
        code = getattr(owner, "status_code", None)
        if isinstance(code, int):
            return code
    return None


def _is_unauthorized(exc: Exception, message: str | None = None) -> bool:
    text = message if message is not None else str(exc)
    return _status_code(exc) == 401 or "401" in text or "unauthorized" in text.lower()


def _safe_model_key(model_id: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", model_id).strip("._")
    return cleaned or "model"


def _is_platform_ref(model_id: str) -> bool:
    return len(model_id.split("/")) == 3


def _hf_search_message(exc: Exception, token_configured: bool, detail: str) -> str:
    if _is_unauthorized(exc, detail):
        if token_configured:
            return (
                "Hugging Face rejected the saved access token (401). "
                "Update it under Settings → Connected Accounts."
            )
        return (
            "This Hugging Face model requires access (401). Add a read access token "
            "under Settings → Connected Accounts, then try again."
        )
    return f"Hugging Face search failed: {detail}"


def _hf_download_message(exc: Exception, token_configured: bool, detail: str) -> str:
    if _is_unauthorized(exc, detail):
        if token_configured:
            return (
                "Hugging Face rejected the saved access token (401). "
                "Update it under Settings → Connected Accounts."
            )
        return (
            "Hugging Face denied access to this model (401). Add a read access token "
            "under Settings → Connected Accounts."
        )
    return detail


def _ultralytics_message(exc: Exception, api_key_configured: bool, detail: str) -> str:
    if not _is_unauthorized(exc, detail):
        return detail
    if api_key_configured:
        return (
            "Ultralytics rejected the saved API key (401). "
            "Update it under Settings → Connected Accounts."
        )
    return (
        "This Ultralytics Platform model requires an API key (401). "
        "Add one under Settings → Connected Accounts."
    )


class ModelService:
    async def search_huggingface(self, query: str) -> list[HFModelSearchResult]:
        token = await credential_service.get_token("huggingface")
        try:
            from huggingface_hub import list_models

            kwargs = {"search": query, "task": "object-detection", "limit": 20}
            if token:
                kwargs["token"] = token
            models = list(list_models(**kwargs))
            return [
                HFModelSearchResult(
                    model_id=m.id,
                    downloads=getattr(m, "downloads", None),
                    likes=getattr(m, "likes", None),
                    tags=list(m.tags) if m.tags else [],
                )
                for m in models
            ]
        except Exception as exc:
            detail = redact_secrets(str(exc), [token])
            message = _hf_search_message(exc, bool(token), detail)
            log.error("hf_search_error", error=message)
            raise ModelCredentialError(message) from exc

    async def download_model(
        self,
        task_id: str,
        req: AIModelDownloadRequest,
        db: AsyncSession | None = None,
        lock_key: str | None = None,
    ) -> None:
        """Download and register a model in the background.

        The task outlives the originating HTTP request, so it must never use
        the request-scoped ``db`` session. It also uses an async HTTP client so
        a slow download cannot stall the event loop for every other request.
        """
        redis = await get_redis()
        hf_token = await credential_service.get_token("huggingface") if req.source == "huggingface" else None
        ul_key = await credential_service.get_token("ultralytics") if req.source == "ultralytics" else None

        async def publish(status: str, pct: float, msg: str):
            payload = json.dumps({"task_id": task_id, "status": status, "progress_pct": pct, "message": msg})
            await redis.set(f"model_download:{task_id}", payload, ex=3600)
            await redis.publish(f"model_download_progress:{task_id}", payload)

        try:
            await publish("downloading", 0, "Starting download...")
            os.makedirs(settings.models_dir, exist_ok=True)

            # Own the session for the whole task lifetime.
            async with AsyncSessionLocal() as own_db:
                if req.source == "ultralytics":
                    url, filename_key = await self._resolve_ultralytics_url(req.model_id, ul_key)
                    dest_path = os.path.join(settings.models_dir, f"{_safe_model_key(filename_key)}.pt")

                    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                        await self._stream_to_file(
                            client,
                            url,
                            dest_path,
                            publish,
                            unauthorized_message=(
                                "Ultralytics rejected the saved API key (401). "
                                "Update it under Settings → Connected Accounts."
                                if ul_key and _is_platform_ref(req.model_id)
                                else "Ultralytics weight download was denied (401). Check network/proxy access."
                            ),
                        )

                elif req.source == "huggingface":
                    from huggingface_hub import hf_hub_download

                    repo_id = req.model_id
                    await publish("downloading", 10, f"Fetching from HuggingFace: {repo_id}")
                    loop = asyncio.get_running_loop()
                    dest_path = await loop.run_in_executor(
                        None,
                        lambda: hf_hub_download(
                            repo_id=repo_id,
                            filename="best.pt",
                            local_dir=settings.models_dir,
                            token=hf_token or None,
                        ),
                    )
                    await publish("downloading", 80, "Extracting model metadata...")
                else:
                    raise ValueError(f"Unknown source: {req.source}")

                await self._finalize_model(task_id, req, dest_path, own_db, publish)

        except Exception as exc:
            detail = redact_secrets(str(exc), [hf_token, ul_key])
            if req.source == "huggingface":
                message = _hf_download_message(exc, bool(hf_token), detail)
            elif req.source == "ultralytics":
                message = _ultralytics_message(exc, bool(ul_key), detail)
            else:
                message = detail
            log.error("model_download_error", task_id=task_id, source=req.source, error=message)
            await publish("error", 0, message)
        finally:
            if lock_key:
                await redis.delete(lock_key)

    async def _resolve_ultralytics_url(self, model_id: str, api_key: str | None) -> tuple[str, str]:
        """Return (download URL, filename key) for public or Platform models."""
        if not _is_platform_ref(model_id):
            if not re.fullmatch(r"[A-Za-z0-9_-]+", model_id):
                raise ValueError("Invalid Ultralytics model id")
            return ULTRALYTICS_RELEASE_URL.format(model_id=model_id), model_id

        if not api_key:
            raise ModelCredentialError(
                "This Ultralytics Platform model requires an API key. "
                "Add one under Settings → Connected Accounts."
            )

        owner, project, model = model_id.split("/")
        files_url = (
            f"{ULTRALYTICS_PLATFORM_API}/models/"
            f"{quote(owner, safe='')}/{quote(project, safe='')}/{quote(model, safe='')}/files"
        )
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                files_url,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if response.status_code == 401:
                raise ModelCredentialError(
                    "Ultralytics rejected the saved API key (401). "
                    "Update it under Settings → Connected Accounts."
                )
            response.raise_for_status()
            files = response.json().get("files", [])

        weights = next(
            (item for item in files if str(item.get("name", "")).lower().endswith(".pt")),
            None,
        )
        if not weights or not weights.get("downloadUrl"):
            raise ValueError("No .pt weights were found for this Ultralytics Platform model")
        return weights["downloadUrl"], f"{owner}_{project}_{model}"

    async def _stream_to_file(
        self,
        client,
        url: str,
        dest_path: str,
        publish,
        unauthorized_message: str,
    ) -> None:
        async with client.stream("GET", url) as response:
            if response.status_code == 401:
                raise ModelCredentialError(unauthorized_message)
            response.raise_for_status()
            total = int(response.headers.get("content-length", 0))
            downloaded = 0
            with open(dest_path, "wb") as f:
                async for chunk in response.aiter_bytes(chunk_size=65536):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = min(90, downloaded / total * 90)
                        await publish(
                            "downloading", pct, f"Downloaded {downloaded // 1024 // 1024} MB"
                        )

    async def _finalize_model(self, task_id, req, dest_path, db, publish):
        await publish("downloading", 90, "Loading model metadata...")
        loop = asyncio.get_running_loop()

        def load_names():
            from ultralytics import YOLO

            m = YOLO(dest_path)
            return list(m.names.values()) if m.names else []

        class_names = await loop.run_in_executor(None, load_names)
        file_size_mb = os.path.getsize(dest_path) / 1024 / 1024

        model = AIModel(
            name=req.name or req.model_id,
            source=req.source,
            model_id=req.model_id,
            file_path=dest_path,
            class_names=class_names,
            ppe_class_ids=[],
            is_active=False,
            file_size_mb=round(file_size_mb, 2),
        )
        db.add(model)
        await db.commit()
        await publish("completed", 100, "Model ready")

    async def stream_progress(self, task_id: str):
        redis = await get_redis()
        # Yield any cached progress first. A missing/expired status means the
        # task no longer exists — terminate the stream instead of hanging.
        cached = await redis.get(f"model_download:{task_id}")
        if not cached:
            yield json.dumps({
                "task_id": task_id,
                "status": "error",
                "progress_pct": 0,
                "message": "Unknown or expired download task",
            })
            return
        payload = cached.decode() if isinstance(cached, bytes) else cached
        yield payload
        try:
            cached_status = json.loads(payload).get("status")
        except (TypeError, ValueError):
            cached_status = None
        if cached_status in ("completed", "error"):
            return

        pubsub = redis.pubsub()
        await pubsub.subscribe(f"model_download_progress:{task_id}")
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = message["data"]
                    if isinstance(data, bytes):
                        data = data.decode()
                    yield data
                    if '"completed"' in data or '"error"' in data:
                        break
        finally:
            await pubsub.unsubscribe(f"model_download_progress:{task_id}")
            await pubsub.aclose()

    async def delete_model_file(self, file_path: str) -> None:
        try:
            path = Path(file_path)
            if path.exists():
                path.unlink()
        except Exception as exc:
            log.warning("model_file_delete_error", path=file_path, error=str(exc))


model_service = ModelService()
