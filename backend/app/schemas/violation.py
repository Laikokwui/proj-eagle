from datetime import datetime
from pydantic import BaseModel


class ViolationResponse(BaseModel):
    id: int
    camera_id: int | None
    camera_name: str | None = None
    ai_model_id: int | None
    screenshot_path: str | None
    screenshot_url: str | None = None
    missing_classes: list[str]
    detection_conf: float | None
    acknowledged: bool
    acknowledged_by: int | None
    acknowledged_at: datetime | None
    occurred_at: datetime

    model_config = {"from_attributes": True}


class ViolationAcknowledge(BaseModel):
    acknowledged: bool = True


class ViolationFilter(BaseModel):
    camera_id: int | None = None
    missing_class: str | None = None
    acknowledged: bool | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None
    cursor: int | None = None
    limit: int = 50
