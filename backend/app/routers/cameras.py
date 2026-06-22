import base64
import json
import cv2
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.camera import Camera
from app.models.user import User
from app.core.dependencies import get_current_user
from app.schemas.camera import CameraCreate, CameraUpdate, CameraResponse, CameraTestResponse
from app.services.camera_service import camera_manager
from app.redis_client import get_redis

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


@router.get("", response_model=list[CameraResponse])
async def list_cameras(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Camera).order_by(Camera.created_at))
    return result.scalars().all()


@router.post("", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
async def create_camera(
    body: CameraCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    camera = Camera(**body.model_dump())
    db.add(camera)
    await db.flush()
    await db.refresh(camera)
    return camera


@router.get("/{camera_id}", response_model=CameraResponse)
async def get_camera(camera_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    camera = await _get_or_404(db, camera_id)
    return camera


@router.patch("/{camera_id}", response_model=CameraResponse)
async def update_camera(
    camera_id: int, body: CameraUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    camera = await _get_or_404(db, camera_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(camera, field, value)
    await db.flush()
    await db.refresh(camera)
    return camera


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_camera(
    camera_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    camera = await _get_or_404(db, camera_id)
    await camera_manager.stop_stream(camera_id)
    await db.delete(camera)


@router.post("/{camera_id}/start", response_model=CameraResponse)
async def start_stream(
    camera_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    camera = await _get_or_404(db, camera_id)
    await camera_manager.start_stream(camera)
    camera.is_streaming = True
    await db.flush()
    await db.refresh(camera)
    return camera


@router.post("/{camera_id}/stop", response_model=CameraResponse)
async def stop_stream(
    camera_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    camera = await _get_or_404(db, camera_id)
    await camera_manager.stop_stream(camera_id)
    camera.is_streaming = False
    await db.flush()
    await db.refresh(camera)
    return camera


@router.get("/{camera_id}/detection-status")
async def get_detection_status(camera_id: int, _: User = Depends(get_current_user)):
    redis = await get_redis()
    raw = await redis.get(f"camera:{camera_id}:last_detection")
    if not raw:
        return {"detected": [], "violations": [], "active": False}
    data = json.loads(raw)
    return {**data, "active": True}


@router.post("/test-url", response_model=CameraTestResponse)
async def test_url(
    body: dict, _: User = Depends(get_current_user)
):
    rtsp_url = body.get("rtsp_url", "").strip()
    if not rtsp_url:
        return CameraTestResponse(success=False, message="No URL provided")
    return await _run_connection_test(rtsp_url)


@router.post("/{camera_id}/test", response_model=CameraTestResponse)
async def test_connection(
    camera_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    camera = await _get_or_404(db, camera_id)
    return await _run_connection_test(camera.rtsp_url)


async def _run_connection_test(rtsp_url: str) -> CameraTestResponse:
    import asyncio
    loop = asyncio.get_running_loop()

    def _capture():
        import time
        cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 8000)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 8000)
        try:
            if not cap.isOpened():
                return CameraTestResponse(
                    success=False,
                    message="Could not open stream. Check the IP address, port, and credentials.",
                )
            # Some cameras buffer slowly — retry a few times before giving up
            for _ in range(6):
                ret, frame = cap.read()
                if ret and frame is not None:
                    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
                    b64 = base64.b64encode(buf.tobytes()).decode()
                    return CameraTestResponse(success=True, message="Connection successful", frame_base64=b64)
                time.sleep(0.5)
            return CameraTestResponse(
                success=False,
                message="Connected but received no frames. Check the stream path and that the camera is actively streaming.",
            )
        except Exception as e:
            return CameraTestResponse(success=False, message=str(e))
        finally:
            cap.release()

    try:
        return await asyncio.wait_for(loop.run_in_executor(None, _capture), timeout=12.0)
    except asyncio.TimeoutError:
        return CameraTestResponse(success=False, message="Connection timed out after 12 seconds. Check the IP address and port.")


async def _get_or_404(db: AsyncSession, camera_id: int) -> Camera:
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    return camera
