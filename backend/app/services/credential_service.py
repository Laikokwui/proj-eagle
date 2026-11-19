"""Runtime storage for Hugging Face and Ultralytics credentials."""

from __future__ import annotations

import re

import structlog
from cryptography.fernet import InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.secrets import decrypt_secret, encrypt_secret, mask_secret
from app.database import AsyncSessionLocal
from app.models.integration_credential import IntegrationCredential
from app.schemas.integration import CredentialStatus

log = structlog.get_logger()

PROVIDERS = ("huggingface", "ultralytics")

_ENV_TOKENS = {
    "huggingface": lambda: settings.hf_token,
    "ultralytics": lambda: settings.ultralytics_api_key,
}


def _validate(provider: str, token: str) -> str:
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown provider: {provider}")

    cleaned = token.strip()
    if not cleaned:
        raise ValueError("Token cannot be empty")
    if len(cleaned) > 2048:
        raise ValueError("Token is too long")

    if provider == "ultralytics" and not re.fullmatch(r"ul_[0-9a-fA-F]{40}", cleaned):
        raise ValueError("Ultralytics API keys look like ul_ followed by 40 hex characters")
    return cleaned


def _decrypt_row(row: IntegrationCredential | None) -> str | None:
    if not row:
        return None
    try:
        return decrypt_secret(row.encrypted_token)
    except InvalidToken:
        log.warning("stored_credential_undecryptable", provider=row.provider)
        return None


class CredentialService:
    async def list_status(self, db: AsyncSession) -> list[CredentialStatus]:
        result = await db.execute(select(IntegrationCredential))
        rows = {row.provider: row for row in result.scalars().all()}

        statuses: list[CredentialStatus] = []
        for provider in PROVIDERS:
            env_token = (_ENV_TOKENS[provider]() or "").strip()
            row = rows.get(provider)
            saved_token = _decrypt_row(row)
            if saved_token:
                statuses.append(
                    CredentialStatus(
                        provider=provider,
                        connected=True,
                        source="saved",
                        hint=mask_secret(saved_token),
                        updated_at=row.updated_at if row else None,
                    )
                )
            elif env_token:
                statuses.append(
                    CredentialStatus(
                        provider=provider,
                        connected=True,
                        source="environment",
                        hint=mask_secret(env_token),
                        updated_at=None,
                    )
                )
            else:
                statuses.append(CredentialStatus(provider=provider, connected=False))
        return statuses

    async def save(self, db: AsyncSession, provider: str, token: str) -> CredentialStatus:
        cleaned = _validate(provider, token)
        result = await db.execute(
            select(IntegrationCredential).where(IntegrationCredential.provider == provider)
        )
        row = result.scalar_one_or_none()
        if row:
            row.encrypted_token = encrypt_secret(cleaned)
            row.token_hint = mask_secret(cleaned)
        else:
            row = IntegrationCredential(
                provider=provider,
                encrypted_token=encrypt_secret(cleaned),
                token_hint=mask_secret(cleaned),
            )
            db.add(row)
        await db.commit()
        await db.refresh(row)
        return CredentialStatus(
            provider=provider,
            connected=True,
            source="saved",
            hint=row.token_hint,
            updated_at=row.updated_at,
        )

    async def clear(self, db: AsyncSession, provider: str) -> CredentialStatus:
        if provider not in PROVIDERS:
            raise ValueError(f"Unknown provider: {provider}")
        result = await db.execute(
            select(IntegrationCredential).where(IntegrationCredential.provider == provider)
        )
        row = result.scalar_one_or_none()
        if row:
            await db.delete(row)
            await db.commit()

        # An environment variable may still provide the credential; report it
        # so the UI does not misleadingly claim the integration is disconnected.
        env_token = (_ENV_TOKENS[provider]() or "").strip()
        if env_token:
            return CredentialStatus(
                provider=provider,
                connected=True,
                source="environment",
                hint=mask_secret(env_token),
                updated_at=None,
            )
        return CredentialStatus(provider=provider, connected=False)

    async def get_token(self, provider: str) -> str | None:
        """Resolve a credential for a background job (saved value wins)."""
        if provider not in PROVIDERS:
            return None
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(IntegrationCredential).where(IntegrationCredential.provider == provider)
                )
                saved = _decrypt_row(result.scalar_one_or_none())
            if saved:
                return saved
        except Exception as exc:
            # A credential lookup must never prevent a public download.
            log.warning("credential_lookup_failed", provider=provider, error=str(exc))

        return (_ENV_TOKENS[provider]() or "").strip() or None


credential_service = CredentialService()
