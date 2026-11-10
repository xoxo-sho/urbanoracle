"""HEAD answers wherever GET does (follow-up 2, 2026-11-10).

A route that answers GET must answer HEAD with the same status and the same
headers, and no body (RFC 9110 §9.3.2). FastAPI's ``@app.get`` registers GET
only, so every API route and the site's catch-all (core/spa.py) answered HEAD
with 405 — visible in the browser console as ``HEAD /login 405`` whenever the
landing page was reached by client-side navigation, and on any uptime or link
checker that probes with HEAD. Auth is unchanged: a data route without a token
is 401 to HEAD exactly as to GET.

Checked against the real application (``main.app``: its middleware, its
routers, and — for the site — ``mount_static_site`` on a miniature export),
so the composition that ships is the one under test.

RED on main (daf395a): every HEAD below answered 405, except the two static
mounts (/_next/static, /fonts), which Starlette's StaticFiles already served.
"""

import asyncio

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

import core.authz as authz
from core import cache
from core.database import get_session
from core.spa import mount_static_site
from main import app

ACTIVE_CLAIMS = {"sub": "gipuid_head_active_000001", "email": "analyst@customcorp.jp", "email_verified": True}
PENDING_CLAIMS = {"sub": "gipuid_head_pending_00001", "email": "visitor@gmail.com", "email_verified": False}
TOKENS = {"active-token": ACTIVE_CLAIMS, "pending-token": PENDING_CLAIMS}

# Read from the application, never listed by hand: a route added later is
# covered without editing this file.
GET_ROUTES = sorted(
    r.path for r in app.routes if isinstance(r, APIRoute) and "GET" in r.methods and "{" not in r.path
)
DATA_ROUTES = [p for p in GET_ROUTES if p not in ("/api/v1/health", "/api/v1/auth/me")]

# Response headers that may differ between two requests for the same thing.
VOLATILE = {"date"}


def _headers(resp) -> dict[str, str]:
    return {k: v for k, v in resp.headers.items() if k not in VOLATILE}


@pytest.fixture()
def client(db_session, monkeypatch):
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    # No upstream credentials: /demographics answers 503 to both methods.
    monkeypatch.delenv("ESTAT_API_KEY", raising=False)
    monkeypatch.setattr(authz, "decode_auth_token", lambda tok: TOKENS.get(tok))
    cache.clear()

    def _session_override():
        yield db_session

    app.dependency_overrides[get_session] = _session_override
    yield TestClient(app)
    app.dependency_overrides.clear()
    cache.clear()


def _raw(method: str, path: str, headers: tuple[tuple[bytes, bytes], ...] = ()) -> tuple[int, dict[str, str], bytes]:
    """Drive the ASGI app directly and return (status, headers, body bytes sent).

    TestClient drops a HEAD response's body before the test can see it, so it
    cannot show whether the application itself sent one.
    """
    messages: list[dict] = []
    received = False

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": b"", "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(b"host", b"testserver"), *headers],
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
    }
    asyncio.run(app(scope, receive, send))
    start = next(m for m in messages if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return start["status"], {k.decode(): v.decode() for k, v in start["headers"]}, body


# ---------------------------------------------------------------------------
# The API
# ---------------------------------------------------------------------------


def test_the_route_list_is_the_application_s():
    """An empty or partial list would let every test below pass vacuously."""
    assert "/api/v1/health" in GET_ROUTES
    assert "/api/v1/auth/me" in GET_ROUTES
    assert len(DATA_ROUTES) >= 7, DATA_ROUTES
    for route in ("/api/v1/demographics", "/api/v1/transport", "/api/v1/population-trends"):
        assert route in DATA_ROUTES


@pytest.mark.parametrize("route", GET_ROUTES)
def test_head_without_a_token_answers_as_get_does(client, route):
    get = client.get(route)
    head = client.head(route)
    assert head.status_code != 405, f"HEAD {route} is 405 — the route answers GET only"
    assert head.status_code == get.status_code
    assert _headers(head) == _headers(get)


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_head_on_a_data_route_without_a_token_is_401(client, route):
    """Auth is unchanged by HEAD: no token, no data and no 200."""
    assert client.head(route).status_code == 401


def test_head_on_the_account_route_without_a_token_is_401(client):
    assert client.head("/api/v1/auth/me").status_code == 401


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_head_for_a_pending_account_is_403_as_get_is(client, route):
    get = client.get(route, headers={"Authorization": "Bearer pending-token"})
    head = client.head(route, headers={"Authorization": "Bearer pending-token"})
    assert get.status_code == 403
    assert head.status_code == 403
    assert _headers(head) == _headers(get)


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_head_for_an_active_account_answers_as_get_does(client, route):
    auth = {"Authorization": "Bearer active-token"}
    get = client.get(route, headers=auth)
    head = client.head(route, headers=auth)
    assert head.status_code == get.status_code
    assert _headers(head) == _headers(get)


def test_head_on_health_is_200_with_the_get_headers_and_no_body():
    get_status, get_headers, get_body = _raw("GET", "/api/v1/health")
    status, headers, body = _raw("HEAD", "/api/v1/health")
    assert (get_status, status) == (200, 200)
    assert body == b"", "the application sent a body with a HEAD response"
    assert headers["content-length"] == str(len(get_body))
    assert headers["content-type"] == get_headers["content-type"]


def test_a_route_that_does_not_answer_get_does_not_answer_head(client):
    """POST-only stays POST-only: HEAD gets what GET gets (405), not the handler."""
    route = "/api/v1/auth/re-evaluate"
    assert client.get(route).status_code == 405
    assert client.head(route).status_code == 405


# ---------------------------------------------------------------------------
# The site (core/spa.py on a miniature export)
# ---------------------------------------------------------------------------

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
FONT = "/fonts/geist/latin-0123456789abcdef.woff2"
SITE_PATHS = [
    "/",
    "/login",
    "/app",
    "/app/",
    "/pending",
    "/robots.txt",
    "/opengraph-image",
    "/data/tokyo-wards.geojson",
    "/_next/static/chunks/a1b2.js",
    FONT,
]


@pytest.fixture()
def site_client(tmp_path, client):
    """main.app with the export mounted as production mounts it; restored after."""
    (tmp_path / "_next" / "static" / "chunks").mkdir(parents=True)
    (tmp_path / "_next" / "static" / "chunks" / "a1b2.js").write_text("console.log(1)")
    (tmp_path / "index.html").write_text("<html><h1>UrbanOracle</h1></html>")
    (tmp_path / "app.html").write_text("<html><div id=dashboard></div></html>")
    (tmp_path / "login.html").write_text("<html><h2>サインイン</h2></html>")
    (tmp_path / "pending.html").write_text("<html><h1>アクセスを審査中です</h1></html>")
    (tmp_path / "404.html").write_text("<html><p>ページが見つかりません</p></html>")
    (tmp_path / "robots.txt").write_text("User-Agent: *\n")
    (tmp_path / "opengraph-image").write_bytes(PNG_BYTES)
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "tokyo-wards.geojson").write_text('{"type":"FeatureCollection","features":[]}')
    (tmp_path / "fonts" / "geist").mkdir(parents=True)
    (tmp_path / "fonts" / "geist" / FONT.rsplit("/", 1)[1]).write_bytes(b"wOF2" + b"\x00" * 64)

    saved = list(app.router.routes)
    assert mount_static_site(app, tmp_path) is True
    try:
        yield client
    finally:
        app.router.routes[:] = saved


@pytest.mark.parametrize("path", SITE_PATHS)
def test_head_on_the_site_is_200_with_the_get_headers(site_client, path):
    get = site_client.get(path)
    head = site_client.head(path)
    assert get.status_code == 200
    assert head.status_code == 200, f"HEAD {path} answered {head.status_code}"
    assert _headers(head) == _headers(get)


@pytest.mark.parametrize("path", ["/", "/login", "/app", FONT])
def test_head_on_the_site_sends_no_body(site_client, path):
    get_status, _, get_body = _raw("GET", path)
    status, headers, body = _raw("HEAD", path)
    assert (get_status, status) == (200, 200)
    assert body == b"", f"HEAD {path}: the application sent {len(body)} body bytes"
    assert headers["content-length"] == str(len(get_body))


def test_head_on_an_unknown_page_is_the_same_404(site_client):
    get = site_client.get("/no-such-page")
    head = site_client.head("/no-such-page")
    assert get.status_code == 404
    assert head.status_code == 404
    assert _headers(head) == _headers(get)


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_with_the_site_mounted_a_data_route_is_still_401_to_head(site_client, route):
    """The catch-all must not answer an API path, to HEAD any more than to GET."""
    assert site_client.head(route).status_code == 401
