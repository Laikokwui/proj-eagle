from sqlalchemy import (
    Column, BigInteger, Integer, String, Boolean, Numeric, DateTime, JSON, ForeignKey, Index
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Violation(Base):
    __tablename__ = "violations"

    id = Column(BigInteger, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="SET NULL"), nullable=True)
    ai_model_id = Column(Integer, ForeignKey("ai_models.id", ondelete="SET NULL"), nullable=True)
    screenshot_path = Column(String(512))
    missing_classes = Column(JSON, nullable=False, default=list)
    detection_conf = Column(Numeric(5, 4))
    acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    occurred_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    camera = relationship("Camera")
    ai_model = relationship("AIModel")

    __table_args__ = (
        Index("idx_violations_camera_id", "camera_id"),
        Index("idx_violations_occurred_at", "occurred_at"),
        Index("idx_violations_unacknowledged", "acknowledged", postgresql_where="acknowledged = false"),
    )
