from datetime import datetime
from pydantic import BaseModel


class AIModelBase(BaseModel):
    name: str
    source: str
    model_id: str


class AIModelResponse(AIModelBase):
    id: int
    file_path: str
    class_names: list[str]
    ppe_class_ids: list[int]
    ppe_class_names: list[str]
    is_active: bool
    file_size_mb: float | None
    downloaded_at: datetime

    model_config = {"from_attributes": True}


class AIModelDownloadRequest(BaseModel):
    source: str  # ultralytics | huggingface
    model_id: str
    name: str | None = None


class AIModelDownloadProgress(BaseModel):
    task_id: str
    status: str  # downloading | completed | error
    progress_pct: float
    message: str


class HFModelSearchResult(BaseModel):
    model_id: str
    downloads: int | None
    likes: int | None
    tags: list[str]


class UltralyticsModelInfo(BaseModel):
    model_id: str
    name: str
    size_mb: float
    description: str


class AIModelRulesUpdate(BaseModel):
    ppe_class_ids: list[int] = []
    ppe_class_names: list[str] = []
