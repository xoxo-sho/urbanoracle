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
    "/api/v1/demographics",
    "/api/v1/disaster-risks",
    "/api/v1/transport",
    # The committed 人口推移 snapshot (real-data plan PR 3): gated like the rest.
    "/api/v1/population-trends",
    # The committed 地価公示 snapshot (real-data plan PR 5): gated like the rest.
    "/api/v1/land-prices",
    # The committed 用途地域 snapshot (real-data plan PR 6): gated like the rest.
    "/api/v1/zoning",
    # The committed 公園等・農用地・森林・原野 snapshot (real-data plan PR 8): gated like the rest.
    "/api/v1/green-land-use",
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
    # No upstream credentials in tests: e-Stat raises before any network I/O,
    # so /demographics answers 503 unless a test stubs the fetch (estat_stub).
    monkeypatch.delenv("ESTAT_API_KEY", raising=False)
    monkeypatch.setattr(authz, "decode_auth_token", lambda tok: TOKENS.get(tok))
    cache.clear()

    def _session_override():
        yield db_session

    app.dependency_overrides[get_session] = _session_override
    yield TestClient(app)
    app.dependency_overrides.clear()
    cache.clear()


# One ward as the three e-Stat tables of the 2025 確報 yield it, parsed
# (test_demographics.py has the row shapes; the published figures are guarded
# in test_census_2025.py from the committed source files).
ESTAT_STUB_POPULATION = {"13101": 66270.0}
ESTAT_STUB_AGE_SHARES = {"13101": {"young": 12.941, "working": 70.81787, "elderly": 16.24113}}
ESTAT_STUB_GROWTH = {"13101": -0.61488}


@pytest.fixture()
def estat_stub(monkeypatch):
    """A healthy e-Stat, for the tests that need every route to answer 200."""
    from services import demographics

    async def fake_population():
        return dict(ESTAT_STUB_POPULATION)

    async def fake_age_shares():
        return {code: dict(shares) for code, shares in ESTAT_STUB_AGE_SHARES.items()}

    async def fake_growth():
        return dict(ESTAT_STUB_GROWTH)

    monkeypatch.setattr(demographics, "fetch_population", fake_population)
    monkeypatch.setattr(demographics, "fetch_age_shares", fake_age_shares)
    monkeypatch.setattr(demographics, "fetch_growth_rates", fake_growth)


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_unauthenticated_is_401(client, route):
    assert client.get(route).status_code == 401


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_pending_is_403_with_structured_body(client, route):
    resp = client.get(route, headers={"Authorization": "Bearer pending-token"})
    assert resp.status_code == 403
    assert resp.json() == {"status": "pending_activation"}


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_active_gets_data(client, estat_stub, route):
    resp = client.get(route, headers={"Authorization": "Bearer active-token"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] in ("ok", "partial")
    assert isinstance(body["data"], list) and body["data"]
    assert isinstance(body["isLive"], bool)


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_every_response_is_strictly_valid_json(client, estat_stub, route):
    resp = client.get(route, headers={"Authorization": "Bearer active-token"})
    assert "NaN" not in resp.text
    json.loads(resp.text, parse_constant=_reject)


def test_disaster_risks_is_live_from_the_committed_snapshot(client):
    """Real-data plan PR 7: the 災害 figures are the committed snapshot's
    (東京都 地域危険度 第9回 + 国土数値情報 A31a / A33 / A40 / A49), validated at
    startup — the sample list with its Lv.1–5 and isLive false is gone."""
    body = client.get("/api/v1/disaster-risks", headers={"Authorization": "Bearer active-token"}).json()
    assert body["isLive"] is True
    assert body["status"] == "ok"
    assert set(body["sources"]) >= {"earthquake", "flood", "landslide", "tsunami", "hightide"}
    assert all("level" not in r for r in body["data"])


def test_transport_is_live_and_complete_from_the_committed_snapshot(client):
    """Real-data plan PR 4: the stations and their ridership are the committed
    国土数値情報 S12 snapshot, validated at startup — no upstream, so no partial
    answer and no 取得日時 to show."""
    body = client.get("/api/v1/transport", headers={"Authorization": "Bearer active-token"}).json()
    assert body["isLive"] is True
    assert body["status"] == "ok"
    assert "unavailable" not in body and "fetchedAt" not in body
    assert body["sources"]["ridership"]["table"].startswith("S12")


def test_land_prices_is_the_committed_snapshot_not_reinfolib(client):
    """Flipped in real-data plan PR 5: the path that once served REINFOLIB
    取引価格 (removed, RECON 2026-10-data-terms UO-3) now serves the committed
    国土数値情報 地価公示 snapshot — validated at startup, no upstream, so no
    partial answer and no 取得日時."""
    body = client.get("/api/v1/land-prices", headers={"Authorization": "Bearer active-token"}).json()
    assert body["isLive"] is True
    assert body["status"] == "ok"
    assert "unavailable" not in body and "fetchedAt" not in body
    assert body["sources"]["price"]["table"].startswith("L01")


def test_zoning_is_the_committed_snapshot(client):
    """Real-data plan PR 6: the 用途地域 composition per ward is the committed
    国土数値情報 A55-24 snapshot, validated at startup — no upstream, so no
    partial answer and no 取得日時; the 23区 composition rides as ``total``."""
    body = client.get("/api/v1/zoning", headers={"Authorization": "Bearer active-token"}).json()
    assert body["isLive"] is True
    assert body["status"] == "ok"
    assert "unavailable" not in body and "fetchedAt" not in body
    assert body["sources"]["zoning"]["table"].startswith("A55")
    assert body["total"]["region"] == "東京23区"
    assert len(body["data"]) == 23


def test_no_service_module_fetches_reinfolib():
    """The land-prices service reads a file; nothing in the backend names or
    calls REINFOLIB (the guard PR 1 wrote as "the module does not exist" became
    "the module performs no fetch" when PR 5 reused the path)."""
    import importlib.util
    from pathlib import Path

    assert importlib.util.find_spec("services.land_prices") is not None
    backend = Path(__file__).resolve().parents[1]
    hits = []
    for folder in ("services", "core"):
        for path in sorted((backend / folder).glob("*.py")):
            text = path.read_text(encoding="utf-8")
            if "reinfolib" in text.lower():
                hits.append(str(path.relative_to(backend)))
            if path.name == "land_prices.py" and "httpx" in text:
                hits.append(f"{path.relative_to(backend)}: imports httpx")
    assert hits == [], hits


def test_no_api_key_is_503_unavailable_not_sample(client):
    """No API key configured ⇒ 503 unavailable, with no data at all.

    Flipped in PR 1 (real-data plan): this used to assert the sample fallback
    with isLive false. A missing key is an outage like any other, and the
    answer must be one the client can tell apart from data.
    """
    resp = client.get("/api/v1/demographics", headers={"Authorization": "Bearer active-token"})
    assert resp.status_code == 503
    assert resp.json() == {"status": "unavailable"}


def test_envelope_neutralizes_a_non_finite_value_from_a_service(client, monkeypatch):
    """The response-boundary guard must catch what upstream code missed.

    Without this, the envelope's json_safe is unobservable in tests (the
    fallback fixtures are clean), so a regression removing it would go
    unnoticed until a real suppressed value hit production.
    """
    from services import transport

    # The snapshot itself is validated at startup; this bypasses the record
    # builder to put a NaN on the wire the way a future service bug could.
    monkeypatch.setattr(
        transport,
        "rows",
        lambda snapshot: [{"id": "s12-000000-13101", "name": "壊れた駅", "lat": float("nan"), "lng": 139.7}],
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
