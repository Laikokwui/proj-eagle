"""Audit items: insecure defaults, permissive CORS, missing admin guard,
WebSocket authentication handshake.
"""

import pytest
from pydantic import ValidationError
from starlette.testclient import WebSocketDenialResponse

from app.core.dependencies import get_current_user
from app.main import app


class TestSecureDefaults:
    def test_jwt_secret_has_no_insecure_default(self, monkeypatch):
        """A deployment that forgets JWT_SECRET must fail fast, not sign
        tokens with a publicly known placeholder."""
        from app.config import Settings

        monkeypatch.delenv("JWT_SECRET", raising=False)
        with pytest.raises(ValidationError):
            Settings(_env_file=None)

    def test_cors_uses_explicit_origin_not_wildcard(self, client):
        """Credentialed/browser requests must get an explicit ACAO value,
        never '*' combined with allow-credentials."""
        response = client.get("/api/health", headers={"Origin": "http://localhost"})
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "http://localhost"


class TestAuthorization:
    async def test_operator_cannot_delete_camera(self, client, operator_user):
        from tests.conftest import add_camera

        camera_id = await add_camera()
        app.dependency_overrides[get_current_user] = lambda: operator_user

        response = client.delete(f"/api/cameras/{camera_id}")

        assert response.status_code == 403

    async def test_operator_cannot_activate_model(self, client, operator_user):
        from tests.conftest import add_model

        model_id = await add_model()
        app.dependency_overrides[get_current_user] = lambda: operator_user

        response = client.post(f"/api/models/{model_id}/activate")

        assert response.status_code == 403

    def test_anonymous_request_is_rejected(self, client):
        app.dependency_overrides.clear()
        response = client.get("/api/cameras")
        assert response.status_code == 401


class TestWebSocketAuth:
    def test_invalid_token_is_denied_during_handshake(self, client):
        """An unauthenticated socket must never reach OPEN state; accepting
        then closing with 4001 still exposes an established connection."""
        accepted = False
        try:
            with client.websocket_connect("/ws/alerts?token=not-a-valid-token") as websocket:
                accepted = True
                websocket.receive()
        except WebSocketDenialResponse:
            pass

        assert accepted is False
