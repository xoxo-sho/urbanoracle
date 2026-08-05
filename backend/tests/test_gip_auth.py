"""Fault-injection tests for the RS256 verifier.

Each case breaks exactly one property the verifier must hold; a verifier
missing that property would accept the token and fail the test. The JWKS
client is stubbed (no network) — the stub always hands back the legitimate
RSA public key, so rejections below are the verifier's own doing.
"""

import base64
import hashlib
import hmac
import json
import time
import types

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

import core.gip_auth as gip_auth

PROJECT = "test-project"

_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_PRIVATE_PEM = _private_key.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
)
_PUBLIC_PEM = _private_key.public_key().public_bytes(
    serialization.Encoding.PEM,
    serialization.PublicFormat.SubjectPublicKeyInfo,
)


def _claims(**overrides):
    now = int(time.time())
    claims = {
        "sub": "gipuid1234567890abcdefghijkl",
        "email": "user@example.co.jp",
        "email_verified": True,
        "aud": PROJECT,
        "iss": f"https://securetoken.google.com/{PROJECT}",
        "iat": now - 10,
        "exp": now + 3600,
    }
    claims.update(overrides)
    return claims


def _rs256(claims) -> str:
    return jwt.encode(claims, _PRIVATE_PEM, algorithm="RS256", headers={"kid": "k1"})


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64_json(obj) -> str:
    return _b64(json.dumps(obj).encode())


@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    monkeypatch.setenv("GIP_PROJECT_ID", PROJECT)
    stub = types.SimpleNamespace(
        get_signing_key_from_jwt=lambda token: types.SimpleNamespace(key=_PUBLIC_PEM)
    )
    monkeypatch.setattr(gip_auth, "_get_jwks_client", lambda: stub)
    yield
    gip_auth.reset_jwks_client()


def test_valid_rs256_token_accepted():
    payload = gip_auth.decode_auth_token(_rs256(_claims()))
    assert payload is not None
    assert payload["sub"] == "gipuid1234567890abcdefghijkl"
    assert payload["email"] == "user@example.co.jp"
    assert payload["email_verified"] is True


def test_hs256_rejected_by_algorithm_pinning(monkeypatch):
    """alg=HS256 must be refused on the strength of the pinning ALONE.

    The JWKS stub is pointed at a non-PEM shared secret that the HMAC
    verifier would happily accept, so ``algorithms=["RS256"]`` is the only
    thing standing between this token and a successful decode — remove the
    pinning and this test goes red. (Signing with the RSA public key instead,
    the classic confusion attack below, is caught by PyJWT's own
    asymmetric-key guard, which would mask a missing pin.)
    """
    secret = "not-a-pem-shaped-shared-secret"
    stub = types.SimpleNamespace(
        get_signing_key_from_jwt=lambda token: types.SimpleNamespace(key=secret)
    )
    monkeypatch.setattr(gip_auth, "_get_jwks_client", lambda: stub)

    token = jwt.encode(_claims(), secret, algorithm="HS256", headers={"kid": "k1"})
    assert gip_auth.decode_auth_token(token) is None


def test_rsa_public_key_as_hmac_secret_rejected():
    """The canonical confusion attack, kept as defense-in-depth regression.

    Hand-assembled because PyJWT refuses to *sign* HS256 with PEM material:
    the attacker HMACs the signing input with the PUBLIC key bytes anyone can
    fetch from the JWKS endpoint.
    """
    header = _b64_json({"alg": "HS256", "typ": "JWT", "kid": "k1"})
    payload = _b64_json(_claims())
    signature = hmac.new(
        _PUBLIC_PEM, f"{header}.{payload}".encode(), hashlib.sha256
    ).digest()
    token = f"{header}.{payload}.{_b64(signature)}"
    assert gip_auth.decode_auth_token(token) is None


def test_alg_none_token_rejected():
    token = f"{_b64_json({'alg': 'none', 'typ': 'JWT'})}.{_b64_json(_claims())}."
    assert gip_auth.decode_auth_token(token) is None


def test_wrong_audience_rejected():
    assert gip_auth.decode_auth_token(_rs256(_claims(aud="other-project"))) is None


def test_wrong_issuer_rejected():
    token = _rs256(_claims(iss="https://securetoken.google.com/other-project"))
    assert gip_auth.decode_auth_token(token) is None


def test_expired_token_rejected():
    now = int(time.time())
    token = _rs256(_claims(iat=now - 7200, exp=now - 3600))
    assert gip_auth.decode_auth_token(token) is None


def test_unset_project_id_rejects_everything(monkeypatch):
    """Fail-closed: with no GIP_PROJECT_ID even a perfectly valid token dies."""
    valid = _rs256(_claims())
    assert gip_auth.decode_auth_token(valid) is not None  # sanity: valid when configured
    monkeypatch.delenv("GIP_PROJECT_ID", raising=False)
    assert gip_auth.decode_auth_token(valid) is None
