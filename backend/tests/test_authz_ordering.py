"""Authentication is decided before the database is touched.

Found by running the container: with no DATABASE_URL, every protected route
answered 500 instead of 401, because FastAPI had already resolved the session
dependency before the credential check ran. Two consequences:

  - a database outage turns every 401 into a 500, so the deploy-time gate
    ("protected routes must answer 401") reports the wrong failure, and
  - anonymous traffic can drive database connection attempts.

These tests pin the ordering. The session dependency here raises on use, the
way an unconfigured or unreachable database does.
"""

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

import core.authz as authz
from core.authz import get_current_user, register_authz_handlers, require_active
from core.database import get_session
from db.models import User

CLAIMS = {
    "sub": "gipuid_ordering_test_000001",
    "email": "someone@customcorp.jp",
    "email_verified": True,
}


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(authz, "decode_auth_token", lambda tok: CLAIMS if tok == "good" else None)

    app = FastAPI()
    register_authz_handlers(app)

    @app.get("/api/v1/protected")
    def protected(user: User = Depends(require_active)):
        return {"ok": True}

    @app.get("/api/v1/authed")
    def authed(user: User = Depends(get_current_user)):
        return {"ok": True}

    def exploding_session():
        raise RuntimeError("DATABASE_URL is not set — refusing to guess a database")
        yield  # pragma: no cover

    app.dependency_overrides[get_session] = exploding_session
    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize("route", ["/api/v1/protected", "/api/v1/authed"])
def test_no_credentials_is_401_even_with_an_unusable_database(client, route):
    assert client.get(route).status_code == 401


@pytest.mark.parametrize("route", ["/api/v1/protected", "/api/v1/authed"])
def test_invalid_token_is_401_even_with_an_unusable_database(client, route):
    resp = client.get(route, headers={"Authorization": "Bearer garbage"})
    assert resp.status_code == 401


@pytest.mark.parametrize("route", ["/api/v1/protected", "/api/v1/authed"])
def test_non_bearer_scheme_is_401_even_with_an_unusable_database(client, route):
    resp = client.get(route, headers={"Authorization": "Basic dXNlcjpwYXNz"})
    assert resp.status_code == 401


def test_a_valid_token_does_reach_the_database(client):
    """The ordering must not have made the session unreachable for real users."""
    resp = client.get("/api/v1/authed", headers={"Authorization": "Bearer good"})
    # The database is deliberately broken here, so this is a 500 — the point is
    # that a VALID token gets far enough to touch it, unlike the cases above.
    assert resp.status_code == 500
