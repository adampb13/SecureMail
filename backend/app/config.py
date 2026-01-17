import secrets
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    access_token_expire_minutes: int = 60
    database_url: str = "sqlite:///./securemail.db"
    totp_issuer: str = "SecureMail"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="SECUREMAIL_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
