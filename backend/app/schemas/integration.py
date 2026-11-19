from datetime import datetime

from pydantic import BaseModel, Field


class CredentialUpdate(BaseModel):
    token: str = Field(min_length=1, max_length=2048)


class CredentialStatus(BaseModel):
    provider: str
    connected: bool
    source: str | None = None  # saved | environment
    hint: str | None = None
    updated_at: datetime | None = None
