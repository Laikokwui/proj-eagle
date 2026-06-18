import asyncio
import json
import os
import shutil
import structlog
import requests
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ai_model import AIModel
from app.schemas.ai_model import AIModelDownloadRequest, HFModelSearchResult
from app.redis_client import get_redis

log = structlog.get_logger()

ULTRALYTICS_RELEASE_URL = "https://github.com/ultralytics/assets/releases/download/v8.3.0/{model_id}.pt"


class ModelService:
    async def search_huggingface(self, query: str) -> list[HFModelSearchResult]:
        try:
            from huggingface_hub import list_models
            models = list(list_models(search=query, task="object-detection", limit=20))
            return [
                HFModelSearchResult(
                    model_id=m.id,
                    downloads=getattr(m, "downloads", None),
                    likes=getattr(m, "likes", None),
                    tags=list(m.tags) if m.tags else [],
                )
                for m in models
            ]
        except Exception as e:
            log.error("hf_search_error", error=str(e))
            return []

    async def download_model(self, task_id: str, req: AIModelDownloadRequest, db: AsyncSession) -> None:
        redis = await get_redis()

        async def publish(status: str, pct: float, msg: str):
            payload = json.dumps({"task_id": task_id, "status": status, "progress_pct": pct, "message": msg})
            await redis.set(f"model_download:{task_id}", payload, ex=3600)
            await redis.publish(f"model_download_progress:{task_id}", payload)

        try:
            await publish("downloading", 0, "Starting download...")
            os.makedirs(settings.models_dir, exist_ok=True)

            if req.source == "ultralytics":
                url = ULTRALYTICS_RELEASE_URL.format(model_id=req.model_id)
                file_name = f"{req.model_id}.pt"
            elif req.source == "huggingface":
                from huggingface_hub import hf_hub_download
                repo_id = req.model_id
                await publish("downloading", 10, f"Fetching from HuggingFace: {repo_id}")
                loop = asyncio.get_running_loop()
                local_path = await loop.run_in_executor(
                    None,
                    lambda: hf_hub_download(
                        repo_id=repo_id,
                        filename="best.pt",
                        local_dir=settings.models_dir,
                        token=settings.hf_token or None,
                    ),
                )
                dest_path = local_path
                await publish("downloading", 80, "Extracting model metadata...")
                await self._finalize_model(task_id, req, dest_path, db, publish)
                return
            else:
                raise ValueError(f"Unknown source: {req.source}")

            dest_path = os.path.join(settings.models_dir, file_name)
            response = requests.get(url, stream=True, timeout=30)
            response.raise_for_status()
            total = int(response.headers.get("content-length", 0))
            downloaded = 0

            with open(dest_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=65536):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = min(90, downloaded / total * 90)
                        await publish("downloading", pct, f"Downloaded {downloaded // 1024 // 1024} MB")

            await self._finalize_model(task_id, req, dest_path, db, publish)

        except Exception as e:
            log.error("model_download_error", task_id=task_id, error=str(e))
            await publish("error", 0, str(e))

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
        # Yield any cached progress first
        cached = await redis.get(f"model_download:{task_id}")
        if cached:
            yield cached.decode() if isinstance(cached, bytes) else cached

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
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            log.warning("model_file_delete_error", path=file_path, error=str(e))


model_service = ModelService()
