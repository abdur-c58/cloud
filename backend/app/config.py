"""Application configuration loaded from environment / .env file."""

from __future__ import annotations

from functools import lru_cache
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Cloudflare R2
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""

    # Auth
    app_password: str = "change-me-please"
    jwt_secret: str = "please-generate-a-long-random-secret"
    internal_api_secret: str = "change-me-internal-secret"
    gate_ttl_minutes: int = 15
    session_ttl_minutes: int = 60 * 24 * 7
    presign_ttl_seconds: int = 3600

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # CORS
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Supabase
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_project_id: str = ""
    supabase_db_password: str = ""
    database_url: str = ""

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def r2_configured(self) -> bool:
        return bool(
            self.r2_account_id
            and self.r2_access_key_id
            and self.r2_secret_access_key
            and self.r2_bucket_name
        )

    @property
    def openai_configured(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def supabase_configured(self) -> bool:
        return bool(self.database_url or (self.supabase_project_id and self.supabase_db_password))

    @property
    def r2_endpoint(self) -> str:
        return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"

    @property
    def postgres_dsn(self) -> str:
        if self.database_url:
            return self.database_url
        if not self.supabase_project_id or not self.supabase_db_password:
            raise RuntimeError(
                "Database not configured. Set DATABASE_URL or "
                "SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD."
            )
        password = quote_plus(self.supabase_db_password)
        host = f"db.{self.supabase_project_id}.supabase.co"
        return f"postgresql://postgres:{password}@{host}:5432/postgres"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
