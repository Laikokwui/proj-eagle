from sqlalchemy import Column, DateTime, String, Text, func

from app.database import Base


class IntegrationCredential(Base):
    """Admin-saved third-party credentials, encrypted at rest."""

    __tablename__ = "integration_credentials"

    provider = Column(String(32), primary_key=True)
    encrypted_token = Column(Text, nullable=False)
    token_hint = Column(String(64), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
