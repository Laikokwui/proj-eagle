import asyncio
import os
import re
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models.ai_model import AIModel
from app.models.user import User
from app.core.dependencies import get_current_user, require_admin
from app.redis_client import get_redis
from app.schemas.ai_model import (
    AIModelResponse, AIModelDownloadRequest, HFModelSearchResult,
    UltralyticsModelInfo, AIModelRulesUpdate,
)
from app.services.model_service import ModelCredentialError, model_service
from app.services.detection_service import detection_service

router = APIRouter(prefix="/api/models", tags=["models"])

ULTRALYTICS_MODELS = [
    {"model_id": "yolov8n", "name": "YOLOv8 Nano", "size_mb": 6.2, "description": "Fastest, smallest"},
    {"model_id": "yolov8s", "name": "YOLOv8 Small", "size_mb": 22.5, "description": "Fast and small"},
    {"model_id": "yolov8m", "name": "YOLOv8 Medium", "size_mb": 52.0, "description": "Balanced"},
    {"model_id": "yolov8l", "name": "YOLOv8 Large", "size_mb": 87.7, "description": "High accuracy"},
    {"model_id": "yolov8x", "name": "YOLOv8 XLarge", "size_mb": 136.7, "description": "Highest accuracy"},
    {"model_id": "yolov9c", "name": "YOLOv9 C", "size_mb": 102.0, "description": "YOLOv9 compact"},
    {"model_id": "yolov9e", "name": "YOLOv9 E", "size_mb": 189.0, "description": "YOLOv9 extended"},
    {"model_id": "yolo11n", "name": "YOLO11 Nano", "size_mb": 5.4, "description": "Latest nano"},
    {"model_id": "yolo11s", "name": "YOLO11 Small", "size_mb": 18.4, "description": "Latest small"},
    {"model_id": "yolo11m", "name": "YOLO11 Medium", "size_mb": 38.8, "description": "Latest medium"},
    {"model_id": "yolo11l", "name": "YOLO11 Large", "size_mb": 49.0, "description": "Latest large"},
    {"model_id": "yolo11x", "name": "YOLO11 XLarge", "size_mb": 109.3, "description": "Latest xlarge"},
]


@router.get("", response_model=list[AIModelResponse])
async def list_models(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(AIModel).order_by(AIModel.downloaded_at.desc()))
    return result.scalars().all()


@router.get("/ultralytics", response_model=list[UltralyticsModelInfo])
async def list_ultralytics(_: User = Depends(get_current_user)):
    return [UltralyticsModelInfo(**m) for m in ULTRALYTICS_MODELS]


@router.get("/huggingface/search", response_model=list[HFModelSearchResult])
async def search_huggingface(q: str = "ppe", _: User = Depends(get_current_user)):
    try:
        return await model_service.search_huggingface(q)
    except ModelCredentialError as exc:
        # 401 is an upstream/provider problem. Using 401 here would trigger the
        # frontend's app-auth refresh flow and log the user out.
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/download", status_code=status.HTTP_202_ACCEPTED)
async def start_download(
    body: AIModelDownloadRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    redis = await get_redis()
    lock_key = f"model_download_active:{body.source}:{body.model_id}"
    existing = await redis.get(lock_key)
    if existing:
        # Already downloading — return the existing task instead of racing on
        # the same destination file.
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"task_id": existing.decode() if isinstance(existing, bytes) else existing},
        )

    task_id = str(uuid.uuid4())
    await redis.set(lock_key, task_id, ex=3600)
    asyncio.create_task(model_service.download_model(task_id, body, db, lock_key=lock_key))
    return {"task_id": task_id}


@router.get("/download-progress/{task_id}")
async def download_progress(task_id: str, _: User = Depends(get_current_user)):
    async def event_stream():
        async for chunk in model_service.stream_progress(task_id):
            yield f"data: {chunk}\n\n"
    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{model_id}/activate", response_model=AIModelResponse)
async def activate_model(
    model_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
):
    result = await db.execute(select(AIModel).where(AIModel.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

    await db.execute(AIModel.__table__.update().values(is_active=False))
    model.is_active = True
    await db.flush()
    await db.refresh(model)

    await detection_service.reload_model(
        model.file_path,
        model.ppe_class_ids or [],
        model.ppe_class_names or [],
        model_id=model.id,
    )
    return model


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(
    model_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
):
    result = await db.execute(select(AIModel).where(AIModel.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    if model.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete active model")
    await model_service.delete_model_file(model.file_path)
    await db.delete(model)


@router.patch("/{model_id}/rules", response_model=AIModelResponse)
async def update_rules(
    model_id: int,
    body: AIModelRulesUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(AIModel).where(AIModel.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    model.ppe_class_ids = body.ppe_class_ids
    model.ppe_class_names = body.ppe_class_names
    await db.flush()
    await db.refresh(model)
    if model.is_active:
        detection_service.set_active_model(
            model.file_path,
            model.ppe_class_ids,
            model.ppe_class_names,
            model_id=model.id,
        )
    return model


@router.post("/upload", response_model=AIModelResponse, status_code=status.HTTP_201_CREATED)
async def upload_model(
    file: UploadFile = File(...),
    name: str = Form(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not (file.filename or "").lower().endswith(".pt"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .pt files are supported")

    os.makedirs(settings.models_dir, exist_ok=True)
    safe_filename = re.sub(r"[^a-zA-Z0-9._-]", "_", file.filename or "model.pt")
    # Avoid filename collisions
    dest_path = os.path.join(settings.models_dir, safe_filename)
    if os.path.exists(dest_path):
        base, ext = os.path.splitext(safe_filename)
        dest_path = os.path.join(settings.models_dir, f"{base}_{uuid.uuid4().hex[:6]}{ext}")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    contents = await file.read(max_bytes + 1)
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Model file exceeds the {settings.max_upload_mb} MB limit",
        )

    with open(dest_path, "wb") as f:
        f.write(contents)

    loop = asyncio.get_running_loop()

    def _load_names():
        from ultralytics import YOLO
        m = YOLO(dest_path)
        return list(m.names.values()) if m.names else []

    try:
        class_names = await loop.run_in_executor(None, _load_names)
    except Exception as e:
        os.remove(dest_path)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Failed to load model: {e}")

    file_size_mb = os.path.getsize(dest_path) / 1024 / 1024
    model = AIModel(
        name=name,
        source="upload",
        model_id=os.path.basename(dest_path),
        file_path=dest_path,
        class_names=class_names,
        ppe_class_ids=[],
        is_active=False,
        file_size_mb=round(file_size_mb, 2),
    )
    db.add(model)
    await db.commit()
    await db.refresh(model)
    return model
