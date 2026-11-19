"""Version reporting and admin-managed third-party credentials."""

from app.config import settings
from app.core.dependencies import get_current_user
from app.main import app
from app.services.credential_service import credential_service
from app.version import APP_VERSION


class TestVersion:
    def test_version_endpoint_matches_app_metadata(self, client):
        response = client.get("/api/version")

        assert response.status_code == 200
        assert response.json()["version"] == APP_VERSION
        assert response.json()["name"]

    def test_health_includes_version(self, client):
        response = client.get("/api/health")

        assert response.status_code == 200
        assert response.json()["version"] == APP_VERSION


class TestCredentialEndpoints:
    async def test_saved_credential_is_masked_and_usable(self, client):
        token = "hf_abcdefghijklmnopqrstuvwxyz1234"

        saved = client.put("/api/integrations/credentials/huggingface", json={"token": token})
        assert saved.status_code == 200
        assert saved.json()["connected"] is True
        assert saved.json()["source"] == "saved"
        assert token not in saved.json()["hint"]
        assert saved.json()["hint"].endswith("1234")

        listed = client.get("/api/integrations/credentials")
        by_provider = {item["provider"]: item for item in listed.json()}
        assert by_provider["huggingface"]["connected"] is True
        assert token not in listed.text
        assert await credential_service.get_token("huggingface") == token

        cleared = client.delete("/api/integrations/credentials/huggingface")
        assert cleared.status_code == 200
        assert cleared.json()["connected"] is False
        assert await credential_service.get_token("huggingface") is None

    def test_environment_credential_is_reported(self, client, monkeypatch):
        monkeypatch.setattr(settings, "hf_token", "hf_environment_token_9876")

        listed = client.get("/api/integrations/credentials")
        by_provider = {item["provider"]: item for item in listed.json()}

        assert by_provider["huggingface"]["source"] == "environment"
        assert by_provider["huggingface"]["connected"] is True
        assert "hf_environment_token_9876" not in listed.text

    def test_operator_cannot_save_credentials(self, client, operator_user, admin_user):
        app.dependency_overrides[get_current_user] = lambda: operator_user
        try:
            response = client.put(
                "/api/integrations/credentials/huggingface",
                json={"token": "hf_should_not_be_saved"},
            )
        finally:
            app.dependency_overrides[get_current_user] = lambda: admin_user

        assert response.status_code == 403

    def test_malformed_ultralytics_key_is_rejected(self, client):
        response = client.put(
            "/api/integrations/credentials/ultralytics",
            json={"token": "not-an-api-key"},
        )

        assert response.status_code == 422
        assert "ul_" in response.json()["detail"]

    def test_unknown_provider_is_not_found(self, client):
        response = client.put(
            "/api/integrations/credentials/unknown",
            json={"token": "anything"},
        )
        assert response.status_code == 404
