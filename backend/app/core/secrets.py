"""Helpers for storing third-party credentials without logging them."""

from __future__ import annotations

import base64
import hashlib
from collections.abc import Iterable

from cryptography.fernet import Fernet

from app.config import settings


def _fernet() -> Fernet:
    # Derive a stable encryption key from the deployment secret. Rotating
    # JWT_SECRET invalidates saved tokens, which is acceptable and forces a
    # deliberate re-connect rather than silently using stale credentials.
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.jwt_secret.encode()).digest())
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


def mask_secret(value: str) -> str:
    """Return a non-reversible hint suitable for displaying in the UI."""
    cleaned = value.strip()
    if len(cleaned) <= 4:
        return "••••"
    return f"••••{cleaned[-4:]}"


def redact_secrets(message: str, secrets: Iterable[str | None]) -> str:
    """Remove raw credentials from error text before logging or publishing."""
    cleaned = message
    for secret in secrets:
        if not secret:
            continue
        cleaned = cleaned.replace(secret, "***")
        cleaned = cleaned.replace(base64.b64encode(secret.encode()).decode(), "***")
    return cleaned
