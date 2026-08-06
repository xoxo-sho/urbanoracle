"""End-to-end route behavior: the second gate, headers, and the envelope.

Every ported endpoint must produce the same three distinct outcomes:
unauthenticated 401, authenticated-but-pending 403 + pending_activation,
authenticated-and-active 200.
"""

import json

import pytest
from fastapi.testclient import TestClient

import core.authz as authz
from core import cache
from core.database import get_session
from main import app
from middleware.security_headers import SECURITY_HEADERS

DATA_ROUTES = [
    "/api/v1/land-prices",
    "/api/v1/demographics",
    "/api/v1/disaster-risks",
    "/api/v1/transport",
]

ACTIVE_CLAIMS = {
    "sub": "gipuid_routes_active_00001",
    "email": "analyst@customcorp.jp",
    "email_verified": True,  # verified -> active
}
PENDING_CLAIMS = {
    "sub": "gipuid_routes_pending_0001",
    "email": "visitor@gmail.com",
    # UNVERIFIED is now the only way to be pending — see test_second_gate.
    "email_verified": False,
}
TOKENS = {"active-token": ACTIVE_CLAIMS, "pending-token": PENDING_CLAIMS}


@pytest.fixture()
def client(db_session, monkeypatch):
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    # No upstream credentials in tests: land-prices/demographics take their
    # fallback path, which is itself worth exercising.
    monkeypatch.delenv("REINFOLIB_API_KEY", raising=False)
    monkeypatch.delenv("ESTAT_API_KEY", raising=False)
    monkeypatch.setattr(authz, "decode_auth_token", lambda tok: TOKENS.get(tok))
    cache.clear()

    def _session_override():
        yield db_session

    app.dependency_overrides[get_session] = _session_override
    yield TestClient(app)
    app.dependency_overrides.clear()
    cache.clear()


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_unauthenticated_is_401(client, route):
    assert client.get(route).status_code == 401


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_pending_is_403_with_structured_body(client, route):
    resp = client.get(route, headers={"Authorization": "Bearer pending-token"})
    assert resp.status_code == 403
    assert resp.json() == {"status": "pending_activation"}


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_active_gets_data(client, route):
    resp = client.get(route, headers={"Authorization": "Bearer active-token"})
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["data"], list) and body["data"]
    assert isinstance(body["isLive"], bool)


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_every_response_is_strictly_valid_json(client, route):
    resp = client.get(route, headers={"Authorization": "Bearer active-token"})
    assert "NaN" not in resp.text
    json.loads(resp.text, parse_constant=_reject)


def test_disaster_risks_reports_is_live_false(client):
    """The Next route claimed isLive:true while serving static sample data."""
    resp = client.get("/api/v1/disaster-risks", headers={"Authorization": "Bearer active-token"})
    assert resp.json()["isLive"] is False


def test_transport_without_odpt_is_not_claimed_live(client):
    """Stations are real, ridership is not — so the response is not live.

    Claiming isLive with every dailyPassengers null would present "unknown"
    as though it had been measured.
    """
    resp = client.get("/api/v1/transport", headers={"Authorization": "Bearer active-token"})
    body = resp.json()
    assert body["isLive"] is False
    assert len(body["data"]) == 50
    # Never 0 — absence is null.
    assert all(s["dailyPassengers"] is None for s in body["data"])


def test_transport_with_odpt_is_live_and_carries_ridership(client, monkeypatch):
    from services import odpt

    async def fake_ridership():
        return {odpt.normalize_station_name("東京"): 500000}, 2024

    monkeypatch.setattr(odpt, "fetch_ridership", fake_ridership)

    resp = client.get("/api/v1/transport", headers={"Authorization": "Bearer active-token"})
    body = resp.json()
    assert body["isLive"] is True
    tokyo = [s for s in body["data"] if s["name"] == "東京駅"]
    assert tokyo and tokyo[0]["dailyPassengers"] == 500000
    # Stations ODPT does not cover stay null rather than becoming 0.
    uncovered = [s for s in body["data"] if s["name"] != "東京駅"]
    assert all(s["dailyPassengers"] is None for s in uncovered)


def test_upstream_failure_falls_back_with_is_live_false(client):
    """No API key configured ⇒ fallback data, honestly labelled."""
    for route in ("/api/v1/land-prices", "/api/v1/demographics"):
        body = client.get(route, headers={"Authorization": "Bearer active-token"}).json()
        assert body["isLive"] is False
        assert body["data"]


def test_envelope_neutralizes_a_non_finite_value_from_a_service(client, monkeypatch):
    """The response-boundary guard must catch what upstream code missed.

    Without this, the envelope's json_safe is unobservable in tests (the
    fallback fixtures are clean), so a regression removing it would go
    unnoticed until a real suppressed value hit production.
    """
    from services import transport

    monkeypatch.setattr(
        transport,
        "load_stations",
        lambda ridership=None: [
            {"id": "ts-0", "name": "壊れた駅", "lat": float("nan"), "lng": 139.7}
        ],
    )

    resp = client.get("/api/v1/transport", headers={"Authorization": "Bearer active-token"})
    assert resp.status_code == 200
    assert "NaN" not in resp.text
    body = json.loads(resp.text, parse_constant=_reject)
    assert body["data"][0]["lat"] is None


def test_health_is_public_and_unauthenticated(client):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.parametrize(("header", "value"), SECURITY_HEADERS.items())
def test_security_headers_present_on_data_routes(client, header, value):
    resp = client.get("/api/v1/transport", headers={"Authorization": "Bearer active-token"})
    assert resp.headers[header] == value


@pytest.mark.parametrize(("header", "value"), SECURITY_HEADERS.items())
def test_security_headers_present_even_on_401(client, header, value):
    """A rejected request is still a response the browser renders."""
    resp = client.get("/api/v1/transport")
    assert resp.status_code == 401
    assert resp.headers[header] == value


def test_security_header_values_match_the_next_config():
    # Drift guard: these mirror next.config.ts's headers() block.
    assert SECURITY_HEADERS == {
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    }


def test_unknown_api_path_is_a_json_404(client):
    resp = client.get("/api/v1/nope", headers={"Authorization": "Bearer active-token"})
    assert resp.status_code == 404


def _reject(constant_name):
    raise ValueError(f"invalid JSON constant: {constant_name}")
