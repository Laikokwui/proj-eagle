from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_admin
from app.database import get_db
from app.models.user import User
from app.schemas.integration import CredentialStatus, CredentialUpdate
from app.services.credential_service import PROVIDERS, credential_service

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@router.get("/credentials", response_model=list[CredentialStatus])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await credential_service.list_status(db)


@router.put("/credentials/{provider}", response_model=CredentialStatus)
async def save_credential(
    provider: str,
    body: CredentialUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown provider")
    try:
        return await credential_service.save(db, provider, body.token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.delete("/credentials/{provider}", response_model=CredentialStatus)
async def clear_credential(
    provider: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown provider")
    return await credential_service.clear(db, provider)
