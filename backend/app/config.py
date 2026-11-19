from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://ppe:ppe@postgres:5432/ppe"
    redis_url: str = "redis://redis:6379/0"
    # Required: a deployment must never sign tokens with a known placeholder.
    jwt_secret: str
    cors_origins: str = "http://localhost"
    max_upload_mb: int = 500
    jwt_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 7
    data_dir: str = "/data"
    detection_fps: int = 5
    detection_confidence: float = 0.5
    hf_token: str = ""
    ultralytics_api_key: str = ""

    @property
    def models_dir(self) -> str:
        return f"{self.data_dir}/models"

    @property
    def screenshots_dir(self) -> str:
        return f"{self.data_dir}/screenshots"


settings = Settings()
