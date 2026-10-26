"""POST /api/v1/auth/verification-email — UrbanOracle's own verification mail
(Stage 2, 2026-10-25). The Parti R-B list, adapted to this repo's harness and
to D1 (no firebase-admin: the link comes from the Identity Toolkit REST call,
authenticated with the metadata server's access token).

R-B1  an unverified token, lang ja -> 200; Resend called once with from, to,
      reply_to and the Japanese subject; the HTML carries the REBUILT link
      (https://urbanoracle.dxalabs.com/auth/action, mode=verifyEmail, the
      oobCode the Identity Toolkit link carried, lang=ja); a text part exists;
      the recipient is the token's email claim
R-B2  the same in English
R-B3  a body with any other field, or a language other than ja/en -> 422; the
      decode-only dependency returns claims without touching the database
R-B4  no token / an invalid one -> 401 (the product's existing 401s); a
      verified token -> 409 already_verified; a token with no email claim ->
      400 no_email
R-B5  a second request within 60 s -> 429 cooldown, retry_after and
      Retry-After; a sixth within 24 h -> 429 daily_limit, retry_after = the
      seconds until the oldest of those five leaves the window
R-B6  the REST link generation: exact URL, headers and body; the metadata
      token is cached and refreshed before it expires; metadata unreachable
      -> 503; a non-2xx answer -> 503; a missing oobLink or oobCode -> 503;
      no mail and no row on any of them
R-B7  Resend answering 4xx or 5xx, or timing out -> 502, no row
R-B8  no RESEND_API_KEY -> 503, and the ERROR log says so
R-B9  no log line and no response body carries the address, a link, the
      oobCode, the key or the access token
R-B11 the endpoint provisions nothing: no users row, no organizations row
R-B13 the settings carry the five keys with their defaults

The metadata server, the Identity Toolkit and Resend are faked at their seams
(verification_email.metadata_client / identity_client / resend_client, three
httpx.Client factories): nothing leaves the process. Token verification is
stubbed the way every route test here stubs it (core.authz.decode_auth_token).
The modules this stage adds are imported INSIDE each test (_module), so that
before they exist every test fails on its own line instead of the whole
collection erroring.
"""

import importlib
import importlib.util
import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from html import unescape
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

import core.authz as authz
from core.config import settings
from core.database import get_session
from db.models import Organization, User
from main import app

ENDPOINT = "/api/v1/auth/verification-email"
KEY = "re_test_key_DO_NOT_LEAK_7f3a"
ACCESS_TOKEN = "ya29.FAKE-metadata-access-token-DO-NOT-LEAK"
PUBLIC_HOST = "urbanoracle.dxalabs.com"
GIP_PROJECT = "dxalabs-platform"
IDENTITY_URL = f"https://identitytoolkit.googleapis.com/v1/projects/{GIP_PROJECT}/accounts:sendOobCode"
METADATA_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"

TOKENS: dict[str, dict] = {}


def _module():
    """services.verification_email — the module this stage adds."""
    assert importlib.util.find_spec("services.verification_email") is not None, (
        "backend/services/verification_email.py does not exist yet (Stage 2 adds it)"
    )
    return importlib.import_module("services.verification_email")


class Fakes:
    """The metadata server, the Identity Toolkit's sendOobCode and Resend's
    POST /emails, each recorded."""

    def __init__(self, code: str):
        self.code = code
        self.metadata_requests: list[httpx.Request] = []
        self.metadata_raise: BaseException | None = None
        self.metadata_status = 200
        self.metadata_body: dict = {
            "access_token": ACCESS_TOKEN,
            "expires_in": 3599,
            "token_type": "Bearer",
        }
        self.identity_requests: list[httpx.Request] = []
        self.identity_raise: BaseException | None = None
        self.identity_status = 200
        self.identity_body: dict | None = None  # None -> the good answer
        self.resend_requests: list[httpx.Request] = []
        self.resend_status = 200
        self.resend_body: dict = {"id": "email-0001"}
        self.resend_raise: BaseException | None = None

    def firebase_link(self) -> str:
        return (
            f"https://{GIP_PROJECT}.firebaseapp.com/__/auth/action?mode=verifyEmail"
            f"&oobCode={self.code}&apiKey=AIzaFAKE&lang=en"
        )

    def metadata_handler(self, request: httpx.Request) -> httpx.Response:
        self.metadata_requests.append(request)
        if self.metadata_raise is not None:
            raise self.metadata_raise
        return httpx.Response(self.metadata_status, json=self.metadata_body)

    def identity_handler(self, request: httpx.Request) -> httpx.Response:
        self.identity_requests.append(request)
        if self.identity_raise is not None:
            raise self.identity_raise
        if self.identity_body is not None:
            return httpx.Response(self.identity_status, json=self.identity_body)
        email = json.loads(request.content)["email"]
        return httpx.Response(
            self.identity_status,
            json={
                "kind": "identitytoolkit#GetOobConfirmationCodeResponse",
                "email": email,
                "oobLink": self.firebase_link(),
            },
        )

    def resend_handler(self, request: httpx.Request) -> httpx.Response:
        self.resend_requests.append(request)
        if self.resend_raise is not None:
            raise self.resend_raise
        return httpx.Response(self.resend_status, json=self.resend_body)

    def mail(self, i: int = 0) -> dict:
        return json.loads(self.resend_requests[i].content)


@pytest.fixture()
def client(db_session, monkeypatch):
    TOKENS.clear()
    monkeypatch.setenv("GIP_PROJECT_ID", GIP_PROJECT)
    monkeypatch.setattr(authz, "decode_auth_token", lambda tok: TOKENS.get(tok))

    def _session_override():
        yield db_session

    app.dependency_overrides[get_session] = _session_override
    yield TestClient(app)
    app.dependency_overrides.clear()


def _arrange(monkeypatch, *, key: str | None = KEY):
    ve = _module()
    fakes = Fakes(f"OOB-{uuid.uuid4().hex}")
    monkeypatch.setattr(
        ve, "metadata_client", lambda: httpx.Client(transport=httpx.MockTransport(fakes.metadata_handler))
    )
    monkeypatch.setattr(
        ve, "identity_client", lambda: httpx.Client(transport=httpx.MockTransport(fakes.identity_handler))
    )
    monkeypatch.setattr(
        ve, "resend_client", lambda: httpx.Client(transport=httpx.MockTransport(fakes.resend_handler))
    )
    # A fresh token cache for every test: nothing learnt in one leaks into the next.
    ve.token_provider.reset()
    if key is None:
        monkeypatch.delenv("RESEND_API_KEY", raising=False)
    else:
        monkeypatch.setenv("RESEND_API_KEY", key)
    return ve, fakes


def _unverified(prefix: str = "ve"):
    uid = f"{prefix}-{uuid.uuid4().hex[:12]}"
    email = f"{uid}@example.com"
    token = f"token-{uid}"
    TOKENS[token] = {"sub": uid, "email": email, "email_verified": False}
    return uid, email, {"Authorization": f"Bearer {token}"}


def _links(html: str) -> list[str]:
    return [unescape(h) for h in re.findall(r'href="([^"]+)"', html)]


def _product_links(html: str) -> list[str]:
    return [link for link in _links(html) if urlsplit(link).netloc == PUBLIC_HOST]


def _rows(session, uid: str) -> int:
    return session.execute(
        text("SELECT count(*) FROM verification_email_sends WHERE auth_uid = :u"), {"u": uid}
    ).scalar_one()


# ---------- R-B1 / R-B2: the mail, in each language ----------


@pytest.mark.parametrize(
    "lang, subject, heading",
    [
        ("ja", "UrbanOracle のメールアドレスを確認してください", "メールアドレスの確認"),
        ("en", "Confirm your email for UrbanOracle", "Confirm your email address"),
    ],
)
def test_rb1_rb2_unverified_token_gets_product_mail_with_rebuilt_link(
    client, db_session, monkeypatch, lang, subject, heading
):
    ve, fakes = _arrange(monkeypatch)
    uid, email, headers = _unverified()

    res = client.post(ENDPOINT, json={"lang": lang}, headers=headers)

    assert res.status_code == 200, res.text
    assert res.json() == {"sent": True, "retry_after": 60}
    assert len(fakes.identity_requests) == 1, "one link for the TOKEN's address"
    assert json.loads(fakes.identity_requests[0].content)["email"] == email
    assert len(fakes.resend_requests) == 1, "Resend called once"
    request = fakes.resend_requests[0]
    assert str(request.url) == "https://api.resend.com/emails"
    assert request.headers["authorization"] == f"Bearer {KEY}"
    idem = request.headers["idempotency-key"]
    assert idem.startswith(f"verify-{uid}-") and idem.rsplit("-", 1)[1].isdigit()
    mail = fakes.mail()
    assert mail["from"] == "UrbanOracle <noreply@send.dxalabs.com>"
    assert mail["to"] == [email], "the recipient is the token's email claim"
    assert mail["reply_to"] == "contact@dxalabs.com"
    assert mail["subject"] == subject
    assert heading in mail["html"]
    links = _product_links(mail["html"])
    assert links, "the HTML carries UrbanOracle's link"
    for link in links:
        parts = urlsplit(link)
        assert (parts.scheme, parts.netloc, parts.path) == ("https", PUBLIC_HOST, "/auth/action")
        assert parse_qs(parts.query) == {
            "mode": ["verifyEmail"],
            "oobCode": [fakes.code],
            "lang": [lang],
        }
    assert mail["text"].strip(), "a plain-text part exists"
    assert links[0] in mail["text"]
    assert "firebaseapp.com" not in mail["html"] + mail["text"], "never the tenant's link"
    assert _rows(db_session, uid) == 1


# ---------- R-B3: the body is {"lang": "ja" | "en"} and nothing else ----------


@pytest.mark.parametrize(
    "payload",
    [{"lang": "ja", "email": "someone-else@example.com"}, {"lang": "fr"}, {}],
    ids=["extra-email-field", "lang-fr", "no-lang"],
)
def test_rb3_any_other_body_is_422(client, db_session, monkeypatch, payload):
    ve, fakes = _arrange(monkeypatch)
    uid, _, headers = _unverified()

    res = client.post(ENDPOINT, json=payload, headers=headers)

    assert res.status_code == 422, res.text
    assert fakes.identity_requests == [] and fakes.resend_requests == []
    assert _rows(db_session, uid) == 0


def test_rb3_decode_only_dependency_returns_claims_without_the_database(monkeypatch):
    """core.authz.require_token_claims: the claims of a valid token, no
    email_verified check, no provisioning — the session dependency is never
    resolved, so an exploding one is never reached."""
    assert hasattr(authz, "require_token_claims"), "authz.require_token_claims does not exist yet"
    claims = {"sub": "gipuid_claims_only_000001", "email": "x@example.com", "email_verified": False}
    monkeypatch.setattr(authz, "decode_auth_token", lambda tok: claims if tok == "good" else None)

    probe = FastAPI()

    @probe.get("/claims")
    def read_claims(c: dict = Depends(authz.require_token_claims)):
        return c

    def exploding_session():
        raise RuntimeError("the database must not be touched")
        yield  # pragma: no cover

    probe.dependency_overrides[get_session] = exploding_session
    tc = TestClient(probe)

    assert tc.get("/claims", headers={"Authorization": "Bearer good"}).json() == claims
    assert tc.get("/claims").status_code == 401
    assert tc.get("/claims", headers={"Authorization": "Bearer bad"}).status_code == 401
    assert tc.get("/claims", headers={"Authorization": "Basic Zm9v"}).status_code == 401


# ---------- R-B4: who may call it ----------


def test_rb4_no_token_is_401(client, monkeypatch):
    ve, fakes = _arrange(monkeypatch)
    res = client.post(ENDPOINT, json={"lang": "ja"})
    assert res.status_code == 401, res.text
    assert res.json() == {"detail": "Not authenticated"}
    assert fakes.identity_requests == [] and fakes.resend_requests == []


def test_rb4_invalid_token_is_401(client, monkeypatch):
    ve, fakes = _arrange(monkeypatch)
    res = client.post(ENDPOINT, json={"lang": "ja"}, headers={"Authorization": "Bearer not-a-jwt"})
    assert res.status_code == 401, res.text
    assert res.json() == {"detail": "Invalid or expired token"}
    assert fakes.identity_requests == [] and fakes.resend_requests == []


def test_rb4_verified_token_is_409_already_verified(client, monkeypatch):
    ve, fakes = _arrange(monkeypatch)
    uid = f"ve-{uuid.uuid4().hex[:12]}"
    TOKENS["verified"] = {"sub": uid, "email": f"{uid}@example.com", "email_verified": True}

    res = client.post(ENDPOINT, json={"lang": "ja"}, headers={"Authorization": "Bearer verified"})

    assert res.status_code == 409, res.text
    assert res.json() == {"detail": "already_verified"}
    assert fakes.identity_requests == [] and fakes.resend_requests == []


def test_rb4_token_without_email_claim_is_400_no_email(client, monkeypatch):
    ve, fakes = _arrange(monkeypatch)
    TOKENS["no-email"] = {"sub": f"ve-noemail-{uuid.uuid4().hex[:12]}", "email_verified": False}

    res = client.post(ENDPOINT, json={"lang": "ja"}, headers={"Authorization": "Bearer no-email"})

    assert res.status_code == 400, res.text
    assert res.json() == {"detail": "no_email"}
    assert fakes.identity_requests == [] and fakes.resend_requests == []


# ---------- R-B5: the ledger — 60 s cooldown, five per 24 h ----------


def test_rb5_second_request_within_60s_is_429_cooldown(client, db_session, monkeypatch):
    ve, fakes = _arrange(monkeypatch)
    uid, _, headers = _unverified()
    first = client.post(ENDPOINT, json={"lang": "ja"}, headers=headers)
    assert first.status_code == 200, first.text

    res = client.post(ENDPOINT, json={"lang": "ja"}, headers=headers)

    assert res.status_code == 429, res.text
    body = res.json()
    assert body["detail"] == "cooldown"
    assert isinstance(body["retry_after"], int) and 1 <= body["retry_after"] <= 60
    assert res.headers["retry-after"] == str(body["retry_after"])
    assert len(fakes.resend_requests) == 1, "the refused request sent nothing"
    assert len(fakes.identity_requests) == 1, "and asked for no link"
    assert _rows(db_session, uid) == 1


def test_rb5_sixth_request_within_24h_is_429_daily_limit(client, db_session, monkeypatch):
    ve, fakes = _arrange(monkeypatch)
    uid, _, headers = _unverified()
    now = datetime.now(timezone.utc)
    oldest = now - timedelta(hours=23)
    for sent_at in (
        oldest,
        now - timedelta(hours=20),
        now - timedelta(hours=10),
        now - timedelta(hours=5),
        now - timedelta(minutes=2),
    ):
        db_session.execute(
            text("INSERT INTO verification_email_sends (auth_uid, sent_at) VALUES (:u, :t)"),
            {"u": uid, "t": sent_at},
        )
    db_session.commit()

    res = client.post(ENDPOINT, json={"lang": "ja"}, headers=headers)

    assert res.status_code == 429, res.text
    body = res.json()
    assert body["detail"] == "daily_limit"
    until_oldest_leaves = (oldest + timedelta(hours=24) - datetime.now(timezone.utc)).total_seconds()
    assert isinstance(body["retry_after"], int)
    assert abs(body["retry_after"] - until_oldest_leaves) <= 5, (body, until_oldest_leaves)
    assert res.headers["retry-after"] == str(body["retry_after"])
    assert fakes.identity_requests == [] and fakes.resend_requests == []
    assert _rows(db_session, uid) == 5


# ---------- R-B6: the REST link generation (D1) ----------


def test_rb6_rest_call_exact_url_headers_and_body(client, monkeypatch):
    ve, fakes = _arrange(monkeypatch)
    uid, email, headers = _unverified()

    res = client.post(ENDPOINT, json={"lang": "ja"}, headers=headers)

    assert res.status_code == 200, res.text
    # The access token: GET on the metadata server with Metadata-Flavor: Google.
    assert len(fakes.metadata_requests) == 1
    meta = fakes.metadata_requests[0]
    assert meta.method == "GET" and str(meta.url) == METADATA_URL
    assert meta.headers["metadata-flavor"] == "Google"
    # The link: POST sendOobCode on the shared tenant, bearer = that token.
    assert len(fakes.identity_requests) == 1
    call = fakes.identity_requests[0]
    assert call.method == "POST" and str(call.url) == IDENTITY_URL
    assert call.headers["authorization"] == f"Bearer {ACCESS_TOKEN}"
    assert call.headers["content-type"].startswith("application/json")
    assert json.loads(call.content) == {
        "requestType": "VERIFY_EMAIL",
        "email": email,
        "returnOobLink": True,
    }


def test_rb6_timeouts_are_ten_seconds():
    ve = _module()
    assert ve.identity_client().timeout == httpx.Timeout(10)
    assert ve.resend_client().timeout == httpx.Timeout(10)


def test_rb6_access_token_is_cached_until_sixty_seconds_before_expiry(client, monkeypatch):
    ve, fakes = _arrange(monkeypatch)
    uid1, _, h1 = _unverified()
    uid2, _, h2 = _unverified()
    uid3, _, h3 = _unverified()
    base = datetime(2026, 10, 25, 12, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(ve, "utcnow", lambda: base)

    assert client.post(ENDPOINT, json={"lang": "ja"}, headers=h1).status_code == 200
    assert client.post(ENDPOINT, json={"lang": "ja"}, headers=h2).status_code == 200
    assert len(fakes.metadata_requests) == 1, "the token is cached across sends"

    # 3599 s lifetime: still valid at +3538 s, refreshed from +3539 s (60 s early).
    monkeypatch.setattr(ve, "utcnow", lambda: base + timedelta(seconds=3540))
    assert client.post(ENDPOINT, json={"lang": "ja"}, headers=h3).status_code == 200
    assert len(fakes.metadata_requests) == 2, "refreshed before it expires"


def test_rb6_metadata_unreachable_is_503_no_mail_no_row(client, db_session, monkeypatch, caplog):
    ve, fakes = _arrange(monkeypatch)
    fakes.metadata_raise = httpx.ConnectError("metadata.google.internal unreachable")
    caplog.set_level(logging.ERROR)
    uid, _, headers = _unverified()

    res = client.post(ENDPOINT, json={"lang": "ja"}, headers=headers)

    assert res.status_code == 503, res.text
    assert res.json() == {"detail": "verification_unavailable"}
    assert fakes.identity_requests == [] and fakes.resend_requests == []
    assert _rows(db_session, uid) == 0
    errors = [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR]
    assert any("metadata" in m and "ConnectError" in m for m in errors), errors


@pytest.mark.parametrize("status", [400, 403, 500])
def test_rb6_identity_toolkit_non_2xx_is_503_logged_by_status_with_address_redacted(
    client, db_session, monkeypatch, caplog, status
):
    ve, fakes = _arrange(monkeypatch)
    uid, email, headers = _unverified()
    fakes.identity_status = status
    fakes.identity_body = {
        "error": {
            "code": status,
            "message": f"PERMISSION_DENIED: no sendEmail for {email.upper()}",
            "status": "PERMISSION_DENIED",
        }
    }
    caplog.set_level(logging.ERROR)

    res = client.post(ENDPOINT, json={"lang": "ja"}, headers=headers)

    assert res.status_code == 503, res.text
    assert res.json() == {"detail": "verification_unavailable"}
    assert fakes.resend_requests == [], "no mail"
    assert _rows(db_session, uid) == 0, "no row"
    errors = [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR]
    assert any(f"status={status}" in m and "PERMISSION_DENIED" in m and "[email]" in m for m in errors), errors
    assert all(email.lower() not in m.lower() for m in errors)


def test_rb6_identity_toolkit_transport_error_is_503(client, db_session, monkeypatch, caplog):
    ve, fakes = _arrange(monkeypatch)
    fakes.identity_raise = httpx.ReadTimeout("timed out")
    caplog.set_level(logging.ERROR)
    uid, _, headers = _unverified()

    res = client.post(ENDPOINT, json={"lang": "ja"}, headers=headers)

    assert res.status_code == 503, res.text
    assert res.json() == {"detail": "verification_unavailable"}
    assert fakes.resend_requests == [] and _rows(db_session, uid) == 0
    errors = [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR]
    assert any("ReadTimeout" in m for m in errors), errors


@pytest.mark.parametrize(
    "body",
    [
        {"kind": "identitytoolkit#GetOobConfirmationCodeResponse", "email": "x@example.com"},
        {"oobLink": f"https://{GIP_PROJECT}.firebaseapp.com/__/auth/action?mode=verifyEmail&apiKey=x"},
        {"oobLink": ""},
    ],
    ids=["no-oobLink", "link-without-oobCode", "empty-oobLink"],
)
def test_rb6_missing_link_or_code_is_503(client, db_session, monkeypatch, body):
    ve, fakes = _arrange(monkeypatch)
    fakes.identity_body = body
    uid, _, headers = _unverified()

    res = client.post(ENDPOINT, json={"lang": "ja"}, headers=headers)

    assert res.status_code == 503, res.text
    assert res.json() == {"detail": "verification_unavailable"}
    assert fakes.resend_requests == []
    assert _rows(db_session, uid) == 0


# ---------- R-B7: Resend failing ----------


@pytest.mark.parametrize("failure", ["4xx", "5xx", "timeout"])
def test_rb7_resend_failure_is_502_no_row(client, db_session, monkeypatch, caplog, failure):
    ve, fakes = _arrange(monkeypatch)
    uid, email, headers = _unverified()
    if failure == "4xx":
        fakes.resend_status = 422
        fakes.resend_body = {
            "statusCode": 422,
            "name": "validation_error",
            "message": f"Invalid `to` field: {email}",
        }
    elif failure == "5xx":
        fakes.resend_status = 500
        fakes.resend_body = {"statusCode": 500, "name": "internal_server_error", "message": "x"}
    else:
        fakes.resend_raise = httpx.ReadTimeout("timed out")
    caplog.set_level(logging.ERROR)

    res = client.post(ENDPOINT, json={"lang": "ja"}, headers=headers)

    assert res.status_code == 502, res.text
    assert res.json() == {"detail": "email_send_failed"}
    assert len(fakes.resend_requests) == 1
    assert _rows(db_session, uid) == 0, "a row exists only for a mail Resend accepted"
    errors = [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR]
    if failure == "4xx":
        assert any("422" in m and "validation_error" in m for m in errors), errors
    if failure == "timeout":
        assert any("ReadTimeout" in m for m in errors), errors


# ---------- R-B8: no key configured ----------


def test_rb8_no_resend_key_is_503_and_logged(client, db_session, monkeypatch, caplog):
    ve, fakes = _arrange(monkeypatch, key=None)
    caplog.set_level(logging.ERROR)
    uid, _, headers = _unverified()

    res = client.post(ENDPOINT, json={"lang": "ja"}, headers=headers)

    assert res.status_code == 503, res.text
    assert res.json() == {"detail": "verification_unavailable"}
    assert fakes.identity_requests == [] and fakes.resend_requests == []
    assert _rows(db_session, uid) == 0
    assert any(
        r.levelno == logging.ERROR and "RESEND_API_KEY is not configured" in r.getMessage()
        for r in caplog.records
    ), [r.getMessage() for r in caplog.records]


# ---------- R-B9: nothing sensitive in logs or bodies ----------


def test_rb9_no_log_or_body_carries_address_link_code_key_or_token(client, monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)
    ve, fakes = _arrange(monkeypatch)
    bodies: list[str] = []

    uid1, email1, h1 = _unverified()
    r1 = client.post(ENDPOINT, json={"lang": "en"}, headers=h1)
    assert r1.status_code == 200, r1.text
    bodies.append(r1.text)
    product_link = _product_links(fakes.mail(0)["html"])[0]

    uid2, email2, h2 = _unverified()
    fakes.resend_status = 422
    fakes.resend_body = {"name": "validation_error", "message": f"Invalid `to`: {email2.upper()}"}
    r2 = client.post(ENDPOINT, json={"lang": "ja"}, headers=h2)
    assert r2.status_code == 502, r2.text
    bodies.append(r2.text)

    uid3, email3, h3 = _unverified()
    fakes.resend_status = 200
    fakes.identity_status = 400
    fakes.identity_body = {"error": {"code": 400, "message": f"INVALID_EMAIL: {email3.upper()}"}}
    r3 = client.post(ENDPOINT, json={"lang": "ja"}, headers=h3)
    assert r3.status_code == 503, r3.text
    bodies.append(r3.text)

    logged = "\n".join(r.getMessage() for r in caplog.records) + "\n" + caplog.text
    forbidden = [email1, email2, email3, fakes.code, KEY, ACCESS_TOKEN, product_link, fakes.firebase_link()]
    for value in forbidden:
        assert value.lower() not in logged.lower(), f"logged: {value}"
        for body in bodies:
            assert value.lower() not in body.lower(), f"in a response body: {value}"


# ---------- R-B11: the endpoint provisions nothing ----------


def test_rb11_endpoint_creates_no_user_or_org(client, db_session, monkeypatch):
    ve, fakes = _arrange(monkeypatch)
    uid, email, headers = _unverified()

    res = client.post(ENDPOINT, json={"lang": "ja"}, headers=headers)

    assert res.status_code == 200, res.text
    assert db_session.scalar(select(func.count()).select_from(User)) == 0
    assert db_session.scalar(select(func.count()).select_from(Organization)) == 0


# ---------- R-B13: settings ----------


def test_rb13_settings_carry_the_verification_keys_with_defaults(monkeypatch):
    for name in ("RESEND_API_KEY", "RESEND_API_BASE_URL", "PUBLIC_BASE_URL",
                 "VERIFICATION_EMAIL_FROM", "VERIFICATION_EMAIL_REPLY_TO"):
        monkeypatch.delenv(name, raising=False)
        assert hasattr(settings, name), f"settings.{name} does not exist yet"
    assert settings.RESEND_API_KEY == ""
    assert settings.RESEND_API_BASE_URL == "https://api.resend.com"
    assert settings.PUBLIC_BASE_URL == "https://urbanoracle.dxalabs.com"
    assert settings.VERIFICATION_EMAIL_FROM == "UrbanOracle <noreply@send.dxalabs.com>"
    assert settings.VERIFICATION_EMAIL_REPLY_TO == "contact@dxalabs.com"
    monkeypatch.setenv("RESEND_API_KEY", "re_x")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://staging.example.com/")
    assert settings.RESEND_API_KEY == "re_x"
    assert settings.PUBLIC_BASE_URL == "https://staging.example.com/"
