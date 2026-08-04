"""GIP (Google Identity Platform) JWT verification — RS256, fail-closed.

Ported from the Parallel City verifier. Tokens are RS256-signed by Google's
securetoken service. Verification checks the signature against Google's
published JWKS plus the exp/iat/iss/aud claims for the configured GIP
project. The verified payload's ``sub`` claim is the GIP uid (a 28-character
NON-UUID string) that core.provisioning resolves against ``users.auth_uid``.

Fail-closed is the whole point of this module: every failure path — bad
signature, wrong project, expired token, unreachable JWKS endpoint, missing
configuration — returns None, which callers turn into a 401. There is
deliberately no path that returns a payload without a verified signature.
"""

import logging

import jwt
from jwt import PyJWKClient

from core.config import settings

logger = logging.getLogger(__name__)

# Lazily constructed JWKS client. Module import must not perform network I/O.
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    """Return the shared JWKS client, creating it on first use.

    Key-rotation handling: Google rotates the securetoken signing keys
    regularly, so the JWK set is cached for at most ``lifespan`` seconds and
    individual signing keys are cached. When a token arrives with a ``kid``
    not in the cached set, PyJWKClient refreshes from the URL and retries
    before failing — new keys are picked up without waiting for the TTL.
    """
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            settings.GIP_JWKS_URL,
            cache_jwk_set=True,
            lifespan=3600,
            cache_keys=True,
            max_cached_keys=16,
        )
    return _jwks_client


def reset_jwks_client() -> None:
    """Drop the cached JWKS client. Used by tests; harmless in production."""
    global _jwks_client
    _jwks_client = None


def decode_auth_token(token: str) -> dict | None:
    """Decode and validate a GIP-issued JWT.

    Returns:
        The decoded payload dict (whose ``sub`` is the GIP uid), or None if
        the token is invalid, expired, issued for another project, or if the
        verifier is unconfigured/unreachable.
    """
    project_id = settings.GIP_PROJECT_ID
    if not project_id:
        # An unconfigured verifier must reject everything, never fall through.
        logger.warning("GIP_PROJECT_ID is unset — rejecting all bearer tokens")
        return None

    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            # Pinned explicitly: without this an attacker could present an
            # HS256 token and have the RSA public key treated as an HMAC
            # secret, or an alg=none token with no signature at all.
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError:
        # Invalid signature / expired / wrong aud / wrong iss / malformed.
        return None
    except Exception:
        # JWKS endpoint unreachable, TLS failure, malformed key material.
        # Availability problems must not become an authentication bypass.
        logger.exception("token verification failed for an infrastructural reason")
        return None
