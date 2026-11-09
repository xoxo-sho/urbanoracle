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
    def POPULATION_TRENDS_PATH(self) -> Path:
        """The committed 人口推移 snapshot (real-data plan PR 3), validated at startup.

        Ships with backend/ in the image. The override exists so a test can
        point the app at a broken file and prove that it refuses to start.
        """
        explicit = os.environ.get("POPULATION_TRENDS_PATH")
        if explicit:
            return Path(explicit)
        return Path(__file__).resolve().parents[1] / "data" / "population_trends.json"

    @property
    def STATIONS_PATH(self) -> Path:
        """The committed 駅別乗降客数 snapshot (real-data plan PR 4), validated at startup.

        Ships with backend/ in the image, like the 人口推移 snapshot. The
        override exists so a test can point the app at a broken file and prove
        that it refuses to start.
        """
        explicit = os.environ.get("STATIONS_PATH")
        if explicit:
            return Path(explicit)
        return Path(__file__).resolve().parents[1] / "data" / "stations.json"

    @property
    def LAND_PRICES_PATH(self) -> Path:
        """The committed 地価公示 snapshot (real-data plan PR 5), validated at startup.

        Ships with backend/ in the image, like the other two snapshots. The
        override exists so a test can point the app at a broken file and prove
        that it refuses to start.
        """
        explicit = os.environ.get("LAND_PRICES_PATH")
        if explicit:
            return Path(explicit)
        return Path(__file__).resolve().parents[1] / "data" / "land_prices.json"

    @property
    def ZONING_PATH(self) -> Path:
        """The committed 用途地域 snapshot (real-data plan PR 6), validated at startup.

        Ships with backend/ in the image, like the other snapshots. The
        override exists so a test can point the app at a broken file and prove
        that it refuses to start.
        """
        explicit = os.environ.get("ZONING_PATH")
        if explicit:
            return Path(explicit)
        return Path(__file__).resolve().parents[1] / "data" / "zoning.json"

    @property
    def DISASTER_RISKS_PATH(self) -> Path:
        """The committed 災害 snapshot (real-data plan PR 7), validated at startup.

        Ships with backend/ in the image, like the other snapshots. The
        override exists so a test can point the app at a broken file and prove
        that it refuses to start.
        """
        explicit = os.environ.get("DISASTER_RISKS_PATH")
        if explicit:
            return Path(explicit)
        return Path(__file__).resolve().parents[1] / "data" / "disaster_risks.json"

    @property
    def GREEN_LAND_USE_PATH(self) -> Path:
        """The committed 公園等・農用地・森林・原野 snapshot (real-data plan PR 8), validated at startup.

        Ships with backend/ in the image, like the other snapshots. The
        override exists so a test can point the app at a broken file and prove
        that it refuses to start.
        """
        explicit = os.environ.get("GREEN_LAND_USE_PATH")
        if explicit:
            return Path(explicit)
        return Path(__file__).resolve().parents[1] / "data" / "green_land_use.json"


settings = Settings()
