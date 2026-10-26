"""Settings read from the environment — missing values fail CLOSED at use.

There are deliberately no baked-in fallbacks for security-relevant values:
an unset GIP_PROJECT_ID makes the token verifier reject everything (see
core/gip_auth.py), never accept anything.
"""

import os
from pathlib import Path

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

    @property
    def ESTAT_API_KEY(self) -> str:
        return os.environ.get("ESTAT_API_KEY", "")

    @property
    def ODPT_API_KEY(self) -> str:
        return os.environ.get("ODPT_API_KEY", "")

    @property
    def STATIC_DIR(self) -> str:
        return os.environ.get("STATIC_DIR", "")

    # ---- The product's own verification mail (services/verification_email.py) ----
    # Only the key is secret: it arrives from Secret Manager through deploy.yml's
    # --set-secrets (urbanoracle-resend-api-key). The other four have code
    # defaults, so no env var is added to the deploy. Unset key -> the endpoint
    # answers 503 and sends nothing (fail closed, like GIP_PROJECT_ID).

    @property
    def RESEND_API_KEY(self) -> str:
        return os.environ.get("RESEND_API_KEY", "")

    @property
    def RESEND_API_BASE_URL(self) -> str:
        return os.environ.get("RESEND_API_BASE_URL", "https://api.resend.com")

    @property
    def PUBLIC_BASE_URL(self) -> str:
        """Origin of the link in the mail; /auth/action on it applies the code."""
        return os.environ.get("PUBLIC_BASE_URL", "https://urbanoracle.dxalabs.com")

    @property
    def VERIFICATION_EMAIL_FROM(self) -> str:
        return os.environ.get("VERIFICATION_EMAIL_FROM", "UrbanOracle <noreply@send.dxalabs.com>")

    @property
    def VERIFICATION_EMAIL_REPLY_TO(self) -> str:
        return os.environ.get("VERIFICATION_EMAIL_REPLY_TO", "contact@dxalabs.com")

    @property
    def DATA_DIR(self) -> Path:
        """Where the committed GeoJSON assets live.

        In the container the Next export is copied to STATIC_DIR, so
        public/data lands at STATIC_DIR/data. Locally and in tests there is
        no export, so fall back to the repo's public/data.
        """
        explicit = os.environ.get("DATA_DIR")
        if explicit:
            return Path(explicit)
        if self.STATIC_DIR:
            return Path(self.STATIC_DIR) / "data"
        return Path(__file__).resolve().parents[2] / "public" / "data"


settings = Settings()
