"""Account-state routes: reachable while pending, and raise-only.

The property that matters here is unusual: these routes must NOT be behind
require_active. The only caller who needs them is a pending user, so gating
them on activation would make the upgrade path unreachable by exactly the
people it exists for.
"""

import pytest
from fastapi.testclient import TestClient

import core.authz as authz
from core.database import get_session
from main import app

PENDING_CLAIMS = {
    "sub": "gipuid_authroutes_pending01",
    "email": "member@acme.com",  # allowlisted below, so only Layer 1 holds it
    "email_verified": False,
}
ACTIVE_CLAIMS = {
    "sub": "gipuid_authroutes_active01",
    "email": "boss@customcorp.jp",  # layer4 -> active
    "email_verified": True,
}


@pytest.fixture()
def client(db_session, monkeypatch):
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_DOMAINS", "acme.com")
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)

    tokens = {"pending-token": dict(PENDING_CLAIMS), "active-token": dict(ACTIVE_CLAIMS)}
    monkeypatch.setattr(authz, "decode_auth_token", lambda tok: tokens.get(tok))

    def _session_override():
        yield db_session

    app.dependency_overrides[get_session] = _session_override
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_pending_user_can_reach_re_evaluate(client):
    """The whole point: a pending account is not locked out of its own upgrade."""
    resp = client.post(
        "/api/v1/auth/re-evaluate", headers={"Authorization": "Bearer pending-token"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending_activation"


def test_pending_user_is_still_blocked_from_data(client):
    """Reachability of /auth/* must not have widened access to anything else."""
    resp = client.get("/api/v1/transport", headers={"Authorization": "Bearer pending-token"})
    assert resp.status_code == 403
    assert resp.json() == {"status": "pending_activation"}


def test_unauthenticated_cannot_reach_re_evaluate(client):
    assert client.post("/api/v1/auth/re-evaluate").status_code == 401


def test_verification_completion_raises_to_active(client, monkeypatch):
    """The Layer-1 upgrade path, end to end through the route."""
    first = client.post(
        "/api/v1/auth/re-evaluate", headers={"Authorization": "Bearer pending-token"}
    )
    assert first.json()["status"] == "pending_activation"

    # The next token carries the verified claim, as it would after the user
    # clicks the link and the client force-refreshes.
    verified = dict(PENDING_CLAIMS, email_verified=True)
    monkeypatch.setattr(
        authz, "decode_auth_token", lambda tok: verified if tok == "pending-token" else None
    )

    second = client.post(
        "/api/v1/auth/re-evaluate", headers={"Authorization": "Bearer pending-token"}
    )
    body = second.json()
    assert body["email_verified"] is True
    assert body["status"] == "active"


def test_me_reports_the_callers_own_state_only(client):
    resp = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer active-token"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "active"
    assert set(body) == {"status", "email_verified", "role"}
    # No identifiers of other accounts, and no data payload.
    assert "email" not in body


def test_re_evaluate_never_deactivates(client, monkeypatch):
    """Raise-only, verified through the HTTP surface as well as the unit."""
    before = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer active-token"})
    assert before.json()["status"] == "active"

    # Tightening the rules so the domain would now pend must not revoke.
    monkeypatch.setenv("URBANORACLE_FREEMAIL_DOMAINS", "customcorp.jp")
    after = client.post(
        "/api/v1/auth/re-evaluate", headers={"Authorization": "Bearer active-token"}
    )
    assert after.json()["status"] == "active"
