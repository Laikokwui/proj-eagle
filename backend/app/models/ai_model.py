from sqlalchemy import Column, Integer, String, Boolean, Numeric, DateTime, JSON, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base


class AIModel(Base):
    __tablename__ = "ai_models"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    source = Column(String(32), nullable=False)  # ultralytics | huggingface
    model_id = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    class_names = Column(JSON, nullable=False, default=list)
    ppe_class_ids = Column(JSON, nullable=False, default=list)
    is_active = Column(Boolean, default=False, index=True)
    file_size_mb = Column(Numeric(8, 2))
    downloaded_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("source", "model_id", name="uq_ai_models_source_model_id"),)
