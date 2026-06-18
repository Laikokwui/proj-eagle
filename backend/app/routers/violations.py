import csv
import io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.violation import Violation
from app.models.camera import Camera
from app.models.user import User
from app.core.dependencies import get_current_user
from app.schemas.violation import ViolationResponse, ViolationAcknowledge
from app.config import settings

router = APIRouter(prefix="/api/violations", tags=["violations"])


def _build_response(v: Violation) -> ViolationResponse:
    camera_name = v.camera.name if v.camera else None
    screenshot_url = f"/screenshots/{v.screenshot_path.split('/')[-1]}" if v.screenshot_path else None
    return ViolationResponse(
        id=v.id,
        camera_id=v.camera_id,
        camera_name=camera_name,
        ai_model_id=v.ai_model_id,
        screenshot_path=v.screenshot_path,
        screenshot_url=screenshot_url,
        missing_classes=v.missing_classes,
        detection_conf=float(v.detection_conf) if v.detection_conf else None,
        acknowledged=v.acknowledged,
        acknowledged_by=v.acknowledged_by,
        acknowledged_at=v.acknowledged_at,
        occurred_at=v.occurred_at,
    )


@router.get("/stats")
async def violation_stats(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(func.count()).select_from(Violation).where(Violation.acknowledged == False)
    )
    return {"unacknowledged_count": result.scalar_one()}


@router.get("/export/csv")
async def export_csv(
    camera_id: int | None = Query(None),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Violation).options(selectinload(Violation.camera)).order_by(Violation.occurred_at.desc())
    conditions = []
    if camera_id:
        conditions.append(Violation.camera_id == camera_id)
    if from_date:
        conditions.append(Violation.occurred_at >= from_date)
    if to_date:
        conditions.append(Violation.occurred_at <= to_date)
    if conditions:
        query = query.where(and_(*conditions))

    result = await db.execute(query)
    violations = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "camera_id", "camera_name", "occurred_at", "missing_classes", "confidence", "acknowledged"])
    for v in violations:
        writer.writerow([
            v.id, v.camera_id,
            v.camera.name if v.camera else "",
            v.occurred_at.isoformat(),
            ",".join(v.missing_classes or []),
            v.detection_conf, v.acknowledged,
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=violations.csv"},
    )


@router.get("", response_model=list[ViolationResponse])
async def list_violations(
    camera_id: int | None = Query(None),
    missing_class: str | None = Query(None),
    acknowledged: bool | None = Query(None),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    cursor: int | None = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = (
        select(Violation)
        .options(selectinload(Violation.camera), selectinload(Violation.ai_model))
        .order_by(Violation.occurred_at.desc())
        .limit(limit)
    )
    conditions = []
    if camera_id is not None:
        conditions.append(Violation.camera_id == camera_id)
    if acknowledged is not None:
        conditions.append(Violation.acknowledged == acknowledged)
    if from_date:
        conditions.append(Violation.occurred_at >= from_date)
    if to_date:
        conditions.append(Violation.occurred_at <= to_date)
    if cursor:
        conditions.append(Violation.id < cursor)
    if conditions:
        query = query.where(and_(*conditions))

    result = await db.execute(query)
    violations = result.scalars().all()

    if missing_class:
        violations = [v for v in violations if missing_class in (v.missing_classes or [])]

    return [_build_response(v) for v in violations]


@router.get("/{violation_id}", response_model=ViolationResponse)
async def get_violation(
    violation_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Violation)
        .options(selectinload(Violation.camera), selectinload(Violation.ai_model))
        .where(Violation.id == violation_id)
    )
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Violation not found")
    return _build_response(v)


@router.patch("/{violation_id}/acknowledge", response_model=ViolationResponse)
async def acknowledge_violation(
    violation_id: int,
    body: ViolationAcknowledge,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Violation)
        .options(selectinload(Violation.camera), selectinload(Violation.ai_model))
        .where(Violation.id == violation_id)
    )
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Violation not found")
    v.acknowledged = body.acknowledged
    v.acknowledged_by = user.id
    from datetime import timezone
    v.acknowledged_at = datetime.now(timezone.utc) if body.acknowledged else None
    await db.flush()
    await db.refresh(v)
    return _build_response(v)
