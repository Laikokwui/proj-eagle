from sqlalchemy import Column, Integer, SmallInteger, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    rtsp_url = Column(String(512), nullable=False)
    location = Column(String(255))
    is_active = Column(Boolean, default=True)
    is_streaming = Column(Boolean, default=False)
    fps_limit = Column(SmallInteger, default=5)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
