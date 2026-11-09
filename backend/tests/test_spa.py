"""Serving the built site: clean URLs, caching, traversal, and content types.

The magic-byte tests are the important ones. Next writes metadata routes with
no file extension, and serving one as text/plain still returns 200 — so a
check that only asserts the status code passes while every social card renders
blank. That is the failure this module exists to prevent.
"""

import mimetypes

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.spa import _resolve_within, mount_static_site, sniff_image_type
from middleware.security_headers import SECURITY_HEADERS

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 64
GIF_BYTES = b"GIF89a" + b"\x00" * 64
WEBP_BYTES = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 64
WOFF2_BYTES = b"wOF2" + b"\x00" * 64
# Named as scripts/vendor-fonts.mjs names them: <subset>-<first 16 hex of sha256>.woff2
VENDORED_FONT = "latin-0123456789abcdef.woff2"


@pytest.fixture()
def site(tmp_path):
    """A miniature copy of the real export layout."""
    (tmp_path / "_next" / "static" / "chunks").mkdir(parents=True)
    (tmp_path / "_next" / "static" / "chunks" / "a1b2.js").write_text("console.log(1)")

    (tmp_path / "index.html").write_text("<html><h1>UrbanOracle</h1></html>")
    (tmp_path / "app.html").write_text("<html><div id=dashboard></div></html>")
    (tmp_path / "login.html").write_text("<html><h2>サインイン</h2></html>")
    (tmp_path / "pending.html").write_text("<html><h1>メールを確認してください</h1></html>")
    (tmp_path / "404.html").write_text("<html><p>ページが見つかりません</p></html>")
    (tmp_path / "sitemap.xml").write_text("<urlset></urlset>")
    (tmp_path / "robots.txt").write_text("User-Agent: *\n")

    # The extensionless metadata route, exactly as Next emits it.
    (tmp_path / "opengraph-image").write_bytes(PNG_BYTES)

    # The vendored web fonts (public/fonts → out/fonts): content-hashed woff2
    # files beside their licence.
    (tmp_path / "fonts" / "geist").mkdir(parents=True)
    (tmp_path / "fonts" / "geist" / VENDORED_FONT).write_bytes(WOFF2_BYTES)
    (tmp_path / "fonts" / "geist" / "OFL.txt").write_text("SIL OPEN FONT LICENSE Version 1.1")
    return tmp_path


@pytest.fixture()
def client(site):
    app = FastAPI()

    @app.get("/api/v1/health")
    async def health():
        return {"status": "ok"}

    assert mount_static_site(app, site) is True
    return TestClient(app)


# ---------------------------------------------------------------------------
# The magic-byte trap
# ---------------------------------------------------------------------------


def test_extensionless_opengraph_image_is_png_not_text(client):
    """The Class-5 trap: 200 + text/plain is a silently blank social card."""
    resp = client.get("/opengraph-image")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/png")
    assert not resp.headers["content-type"].startswith("text/plain")


def test_mimetypes_alone_cannot_type_the_file(site):
    """Why sniffing is required at all, stated as a fact about the platform."""
    assert mimetypes.guess_type("opengraph-image")[0] is None


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (PNG_BYTES, "image/png"),
        (JPEG_BYTES, "image/jpeg"),
        (GIF_BYTES, "image/gif"),
        (WEBP_BYTES, "image/webp"),
    ],
)
def test_sniffs_each_supported_format(tmp_path, data, expected):
    target = tmp_path / "asset"
    target.write_bytes(data)
    assert sniff_image_type(target) == expected


def test_sniffing_does_not_invent_a_type_for_non_images(tmp_path):
    target = tmp_path / "asset"
    target.write_bytes(b"just some bytes")
    assert sniff_image_type(target) is None


def test_sitemap_is_application_xml(client):
    resp = client.get("/sitemap.xml")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/xml")


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------


def test_root_serves_the_landing_page(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert "UrbanOracle" in resp.text


@pytest.mark.parametrize("path", ["/app", "/app/", "/login", "/pending"])
def test_clean_urls_resolve(client, path):
    assert client.get(path).status_code == 200


def test_dashboard_and_landing_page_are_different_documents(client):
    # The canonical-absence discriminator has a runtime counterpart: /app must
    # not be the landing page.
    assert client.get("/app").text != client.get("/").text


def test_unknown_path_is_a_real_404(client):
    resp = client.get("/no-such-page")
    assert resp.status_code == 404
    assert "見つかりません" in resp.text


def test_unknown_api_path_stays_a_json_404(client):
    """A typo'd API path must not silently become HTML."""
    resp = client.get("/api/v1/nope")
    assert resp.status_code == 404
    assert "html" not in resp.headers["content-type"].lower()


def test_real_api_route_still_wins(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}


@pytest.mark.parametrize(
    "attack",
    ["/../etc/passwd", "/..%2f..%2fetc/passwd", "/app/../../etc/passwd"],
)
def test_traversal_is_blocked_over_http(client, attack):
    assert client.get(attack).status_code == 404


# The HTTP cases above are weak evidence on their own: Starlette normalises
# ".." out of the path before the handler runs, so they would pass even with
# the guard removed. These exercise the guard directly, where it lives.
def test_resolve_within_rejects_parent_traversal(tmp_path):
    root = tmp_path / "site"
    root.mkdir()
    (root / "index.html").write_text("ok")
    (tmp_path / "secret.txt").write_text("not yours")

    assert _resolve_within(root.resolve(), "../secret.txt") is None


def test_resolve_within_rejects_a_symlink_pointing_outside(tmp_path):
    """No ".." appears in this path — only resolve() catches it."""
    outside = tmp_path / "secret.txt"
    outside.write_text("not yours")
    root = tmp_path / "site"
    root.mkdir()
    (root / "link.txt").symlink_to(outside)

    assert _resolve_within(root.resolve(), "link.txt") is None


def test_resolve_within_allows_a_real_file_inside_the_root(tmp_path):
    root = tmp_path / "site"
    root.mkdir()
    (root / "index.html").write_text("ok")
    assert _resolve_within(root.resolve(), "index.html") is not None


def test_missing_build_output_mounts_nothing(tmp_path):
    app = FastAPI()
    assert mount_static_site(app, tmp_path / "does-not-exist") is False


# ---------------------------------------------------------------------------
# Caching and headers
# ---------------------------------------------------------------------------


def test_html_is_never_cached(client):
    assert client.get("/").headers["cache-control"] == "no-cache"
    assert client.get("/app").headers["cache-control"] == "no-cache"


def test_hashed_assets_are_immutable(client):
    resp = client.get("/_next/static/chunks/a1b2.js")
    assert resp.status_code == 200
    assert "immutable" in resp.headers["cache-control"]
    assert "max-age=31536000" in resp.headers["cache-control"]


def test_vendored_fonts_are_immutable_like_next_static(client):
    """next/font served these from /_next/static/media with a one-year
    immutable cache; the vendored copies carry a content hash in their name
    and keep it. Without the header a browser revalidates every font file on
    every visit."""
    resp = client.get(f"/fonts/geist/{VENDORED_FONT}")
    assert resp.status_code == 200
    assert resp.content == WOFF2_BYTES
    assert resp.headers["content-type"] == "font/woff2"
    assert resp.headers.get("cache-control") == "public, max-age=31536000, immutable"


def test_the_font_licence_is_served_but_not_cached_forever(client):
    # OFL.txt has no content hash in its name, so it must stay replaceable.
    resp = client.get("/fonts/geist/OFL.txt")
    assert resp.status_code == 200
    assert "SIL OPEN FONT LICENSE" in resp.text
    assert "immutable" not in resp.headers.get("cache-control", "")


def test_a_missing_font_is_a_404_not_the_landing_page(client):
    resp = client.get("/fonts/geist/latin-ffffffffffffffff.woff2")
    assert resp.status_code == 404
    assert "UrbanOracle" not in resp.text


@pytest.mark.parametrize(("header", "value"), SECURITY_HEADERS.items())
def test_security_headers_apply_to_spa_responses(site, header, value):
    """The Stage 3b middleware must cover static responses, not just the API."""
    from middleware.security_headers import SecurityHeadersMiddleware

    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)
    mount_static_site(app, site)
    resp = TestClient(app).get("/")
    assert resp.headers[header] == value
