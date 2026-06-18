import asyncio
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.ai_model import AIModel
from app.models.user import User
from app.core.dependencies import get_current_user
from app.schemas.ai_model import (
    AIModelResponse, AIModelDownloadRequest, HFModelSearchResult, UltralyticsModelInfo
)
from app.services.model_service import model_service
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
    return await model_service.search_huggingface(q)


@router.post("/download", status_code=status.HTTP_202_ACCEPTED)
async def start_download(
    body: AIModelDownloadRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    task_id = str(uuid.uuid4())
    asyncio.create_task(model_service.download_model(task_id, body, db))
    return {"task_id": task_id}


@router.get("/download-progress/{task_id}")
async def download_progress(task_id: str, _: User = Depends(get_current_user)):
    async def event_stream():
        async for chunk in model_service.stream_progress(task_id):
            yield f"data: {chunk}\n\n"
    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{model_id}/activate", response_model=AIModelResponse)
async def activate_model(
    model_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    result = await db.execute(select(AIModel).where(AIModel.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

    await db.execute(AIModel.__table__.update().values(is_active=False))
    model.is_active = True
    await db.flush()
    await db.refresh(model)

    await detection_service.reload_model(model.file_path)
    return model


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(
    model_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    result = await db.execute(select(AIModel).where(AIModel.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    if model.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete active model")
    await model_service.delete_model_file(model.file_path)
    await db.delete(model)
