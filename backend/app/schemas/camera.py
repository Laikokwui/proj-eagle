from datetime import datetime
from pydantic import BaseModel


class CameraBase(BaseModel):
    name: str
    rtsp_url: str
    location: str | None = None
    fps_limit: int = 5


class CameraCreate(CameraBase):
    pass


class CameraUpdate(BaseModel):
    name: str | None = None
    rtsp_url: str | None = None
    location: str | None = None
    fps_limit: int | None = None
    is_active: bool | None = None


class CameraResponse(CameraBase):
    id: int
    is_active: bool
    is_streaming: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CameraTestResponse(BaseModel):
    success: bool
    message: str
    frame_base64: str | None = None
