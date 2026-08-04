"""Settings read from the environment — missing values fail CLOSED at use.

There are deliberately no baked-in fallbacks for security-relevant values:
an unset GIP_PROJECT_ID makes the token verifier reject everything (see
core/gip_auth.py), never accept anything.
"""

import os

_GOOGLE_SECURETOKEN_JWKS = (
    "https://www.googleapis.com/service_accounts/v1/jwk/"
    "securetoken@system.gserviceaccount.com"
)


class Settings:
    """Environment-backed settings, read at access time so tests and the
    runtime environment stay in sync without import-order traps."""

    @property
    def GIP_PROJECT_ID(self) -> str:
        return os.environ.get("GIP_PROJECT_ID", "")

    @property
    def GIP_JWKS_URL(self) -> str:
        return os.environ.get("GIP_JWKS_URL", _GOOGLE_SECURETOKEN_JWKS)

    @property
    def DATABASE_URL(self) -> str:
        return os.environ.get("DATABASE_URL", "")


settings = Settings()
