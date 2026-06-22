import os
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.redis_client import close_redis
from app.routers import auth, cameras, models, violations, stream

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.models_dir, exist_ok=True)
    os.makedirs(settings.screenshots_dir, exist_ok=True)
    # Reset is_streaming — workers don't survive container restarts
    from sqlalchemy import update, select
    from app.database import AsyncSessionLocal
    from app.models.camera import Camera as CameraModel
    from app.models.ai_model import AIModel as AIModelModel
    from app.services.detection_service import detection_service
    async with AsyncSessionLocal() as db:
        await db.execute(update(CameraModel).values(is_streaming=False))
        await db.commit()
        result = await db.execute(select(AIModelModel).where(AIModelModel.is_active == True))
        active_model = result.scalar_one_or_none()
        if active_model:
            detection_service.set_active_model(
                active_model.file_path,
                active_model.ppe_class_ids or [],
                active_model.ppe_class_names or [],
            )
            rule_count = len(active_model.ppe_class_names or active_model.ppe_class_ids or [])
            log.info("active_model_restored", name=active_model.name, violation_classes=rule_count)
    log.info("startup", data_dir=settings.data_dir)
    yield
    from app.services.camera_service import camera_manager
    await camera_manager.stop_all()
    await close_redis()
    log.info("shutdown")


app = FastAPI(title="PPE Compliance Monitor", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(cameras.router)
app.include_router(models.router)
app.include_router(violations.router)
app.include_router(stream.router)

screenshots_dir = settings.screenshots_dir
os.makedirs(screenshots_dir, exist_ok=True)
app.mount("/screenshots", StaticFiles(directory=screenshots_dir), name="screenshots")


@app.get("/api/health")
async def health():
    from app.services.camera_service import camera_manager
    from app.redis_client import get_redis
    redis = await get_redis()
    await redis.ping()
    return {
        "status": "ok",
        "active_streams": len(camera_manager._capture_workers),
    }
