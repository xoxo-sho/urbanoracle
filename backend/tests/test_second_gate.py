"""The second gate: 401 vs 403+pending vs 200 are three distinct outcomes.

401 = unauthenticated (no/invalid token).
403 {"status": "pending_activation"} = authenticated + provisioned + pending.
200 = authenticated + active.
"""

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

import core.authz as authz
from core.authz import register_authz_handlers, require_active
from core.database import get_session
from db.models import User

ACTIVE_CLAIMS = {
    "sub": "gipuid_secondgate_active_001",
    "email": "boss@customcorp.jp",  # layer4 -> auto-approved
    "email_verified": True,
}
PENDING_CLAIMS = {
    "sub": "gipuid_secondgate_pending_1",
    "email": "newbie@gmail.com",  # layer3 -> pending
    "email_verified": True,
}
TOKENS = {"active-token": ACTIVE_CLAIMS, "pending-token": PENDING_CLAIMS}


@pytest.fixture()
def client(db_session, monkeypatch):
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    # Token verification is unit-tested in test_gip_auth; here it is stubbed
    # so the gate logic is exercised in isolation.
    monkeypatch.setattr(authz, "decode_auth_token", lambda tok: TOKENS.get(tok))

    app = FastAPI()
    register_authz_handlers(app)

    @app.get("/protected")
    def protected(user: User = Depends(require_active)):
        return {"ok": True, "email": user.email}

    def _session_override():
        yield db_session

    app.dependency_overrides[get_session] = _session_override
    return TestClient(app)


def test_unauthenticated_is_401(client):
    assert client.get("/protected").status_code == 401


def test_invalid_token_is_401(client):
    resp = client.get("/protected", headers={"Authorization": "Bearer garbage"})
    assert resp.status_code == 401


def test_pending_is_403_with_structured_body(client):
    resp = client.get("/protected", headers={"Authorization": "Bearer pending-token"})
    assert resp.status_code == 403
    assert resp.json() == {"status": "pending_activation"}


def test_active_is_allowed(client):
    resp = client.get("/protected", headers={"Authorization": "Bearer active-token"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "email": "boss@customcorp.jp"}


def test_three_outcomes_are_distinct(client):
    anon = client.get("/protected")
    pend = client.get("/protected", headers={"Authorization": "Bearer pending-token"})
    live = client.get("/protected", headers={"Authorization": "Bearer active-token"})
    assert (anon.status_code, pend.status_code, live.status_code) == (401, 403, 200)
    assert pend.json() == {"status": "pending_activation"}
    assert anon.json() != pend.json()
