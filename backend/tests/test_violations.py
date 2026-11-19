"""Audit items: filter-after-limit pagination bug, invalid limit bounds,
zero confidence coerced to null, stale acknowledged_by, unbounded CSV export.
"""

from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import add_camera, add_violation


class TestViolationFiltering:
    async def test_missing_class_filter_applies_before_pagination(self, client):
        """Five matching rows must be returned even when they are older than
        the first 50 non-matching rows."""
        await add_camera()
        base = datetime(2026, 1, 1, tzinfo=timezone.utc)
        for index in range(5):
            await add_violation(
                missing_classes=["no-vest"],
                occurred_at=base + timedelta(minutes=index),
            )
        for index in range(55):
            await add_violation(
                missing_classes=["hardhat"],
                occurred_at=base + timedelta(minutes=10 + index),
            )

        response = client.get(
            "/api/violations",
            params={"missing_class": "no-vest", "limit": 50},
        )

        assert response.status_code == 200
        assert len(response.json()) == 5

    async def test_filter_combined_with_camera_and_status(self, client):
        camera_id = await add_camera()
        await add_violation(camera_id=camera_id, missing_classes=["no helmet"], acknowledged=False)
        await add_violation(camera_id=camera_id, missing_classes=["no vest"], acknowledged=True)

        response = client.get(
            "/api/violations",
            params={
                "camera_id": camera_id,
                "missing_class": "no helmet",
                "acknowledged": "false",
            },
        )

        assert [row["missing_classes"] for row in response.json()] == [["no helmet"]]


class TestPaginationBounds:
    @pytest.mark.parametrize("limit", [0, -1, -100])
    async def test_non_positive_limits_are_rejected(self, client, limit):
        response = client.get("/api/violations", params={"limit": limit})
        assert response.status_code == 422

    async def test_upper_bound_is_rejected(self, client):
        response = client.get("/api/violations", params={"limit": 1000})
        assert response.status_code == 422

    async def test_valid_upper_bound_is_accepted(self, client):
        response = client.get("/api/violations", params={"limit": 200})
        assert response.status_code == 200


class TestViolationFields:
    async def test_zero_confidence_is_preserved(self, client):
        """0.0 is a valid confidence value, not 'missing'."""
        await add_camera()
        await add_violation(detection_conf=0.0)

        response = client.get("/api/violations")

        assert response.json()[0]["detection_conf"] == 0.0

    async def test_unacknowledging_clears_acknowledged_by(self, client):
        await add_camera()
        violation_id = await add_violation(acknowledged=True, acknowledged_by=7)

        response = client.patch(
            f"/api/violations/{violation_id}/acknowledge",
            json={"acknowledged": False},
        )

        assert response.status_code == 200
        assert response.json()["acknowledged_by"] is None
        assert response.json()["acknowledged_at"] is None


class TestCsvExport:
    async def test_export_honours_row_cap(self, client):
        """CSV export must be bounded so it cannot load the whole table."""
        await add_camera()
        for _ in range(4):
            await add_violation()

        response = client.get("/api/violations/export/csv", params={"limit": 2})

        assert response.status_code == 200
        data_rows = [line for line in response.text.strip().splitlines() if line]
        assert len(data_rows) == 3  # header + two rows

    async def test_export_rejects_excessive_cap(self, client):
        response = client.get("/api/violations/export/csv", params={"limit": 10**9})
        assert response.status_code == 422
