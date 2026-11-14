from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)
    environment: str = "development"
    database_url: SecretStr
    jwt_secret: SecretStr = Field(min_length=32)
    token_minutes: int = Field(default=60, ge=1, le=1440)
    rabbitmq_url: SecretStr
    queue_prefix: str = Field(default="clinic.dev", pattern=r"^[a-zA-Z0-9_.-]+$")
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_starttls: bool = False
    smtp_from: str = "clinic@example.test"
    smtp_timeout: int = Field(default=10, ge=1, le=30)
    lease_seconds: int = Field(default=120, ge=60)
    retry_seconds: str = "10,30,60"
    worker_delay_seconds: float = Field(default=0, ge=0, le=10)
    reminder_lead_minutes: int = Field(default=60, ge=1, le=1440)
    demo_password: SecretStr | None = None

    @property
    def retries(self) -> list[int]:
        values = [int(value) for value in self.retry_seconds.split(",")]
        if not values or len(values) > 5 or any(value < 1 for value in values):
            raise ValueError("retry_seconds must contain 1–5 positive delays")
        return values


@lru_cache
def settings() -> Settings:
    return Settings()
