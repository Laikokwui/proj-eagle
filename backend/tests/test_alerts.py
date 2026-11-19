"""Audit items: failed screenshot writes must not create dangling paths;
active model id must be available to detection for violation persistence.
"""

import json
from unittest.mock import MagicMock

import cv2
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.violation import Violation
from app.services.alert_service import save_violation
from tests.conftest import add_model


class TestViolationPersistence:
    async def test_failed_screenshot_write_does_not_store_path(self, fake_redis, monkeypatch):
        """cv2.imwrite returning False means no file exists; the DB row must
        not point at a screenshot that can never load."""
        monkeypatch.setattr(cv2, "imwrite", MagicMock(return_value=False))

        await save_violation(1, "Gate A", None, object(), ["no helmet"], 0.9)

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Violation).order_by(Violation.id.desc()))
            violation = result.scalars().first()
        assert violation is not None
        assert violation.screenshot_path is None

        alerts = [json.loads(message) for channel, message in fake_redis.published if channel == "alerts"]
        assert alerts[-1]["screenshot_url"] is None

    async def test_successful_screenshot_write_stores_path(self, fake_redis, monkeypatch):
        monkeypatch.setattr(cv2, "imwrite", MagicMock(return_value=True))

        await save_violation(1, "Gate A", None, object(), ["no vest"], 0.8)

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Violation).order_by(Violation.id.desc()))
            violation = result.scalars().first()
        assert violation.screenshot_path is not None
        assert violation.screenshot_path.endswith(".jpg")

    async def test_active_model_id_is_exposed_to_detection(self, client):
        """Activating a model must publish its DB id so violations can be
        linked to the model that produced them."""
        from app.services.detection_service import detection_service

        model_id = await add_model()
        response = client.post(f"/api/models/{model_id}/activate")

        assert response.status_code == 200
        assert detection_service.get_active_model_id() == model_id
