"""Serve the built front-end (Next static export) from FastAPI.

One Next app produces every page, and this module puts it on the domain:

    /                    landing page (out/index.html, prerendered)
    /login, /pending,
    /forgot-password     public shells
    /app                 dashboard shell ("use client", still prerendered)
    /api/v1/*            the API (registered before this catch-all)

Because it is the same origin, the client uses relative /api/v1 paths and no
CORS middleware is needed. It is also why the landing page's canonical tag can
name the host that actually serves it.

Treated as a prerendered site rather than a single-page app: an unknown path
returns 404.html with a real 404. Returning the homepage with a 200 would make
every typo look like a valid page to a crawler. If the dashboard ever gains
client-side routing, a fallback under /app can be added then — not before.
"""

import mimetypes
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from starlette.staticfiles import StaticFiles

# Unknown paths under these prefixes stay JSON 404s. Real API routes win by
# registration order; a typo'd API path must not quietly become HTML.
RESERVED_PREFIXES = ("api/", "docs", "redoc", "openapi.json")

# HTML is never cached, so a new deploy is not pinned behind a stale shell.
NO_CACHE = {"Cache-Control": "no-cache"}

# ---------------------------------------------------------------------------
# Content types for extensionless assets
# ---------------------------------------------------------------------------
# Next emits metadata routes (opengraph-image, icon, …) as files with NO
# extension. mimetypes cannot type them, Starlette's FileResponse falls back to
# text/plain, and every social-card scraper rejects that — while the URL still
# returns 200, so any check that only asserts the status code passes. The card
# renders blank and nothing reports an error. Sniffing the magic bytes is what
# closes that silent failure.
_MAGIC_PREFIXES: tuple[tuple[bytes, str], ...] = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)


def sniff_image_type(path: Path) -> str | None:
    """Return an image media type based on the file's leading bytes."""
    try:
        with path.open("rb") as fh:
            head = fh.read(12)
    except OSError:
        return None
    for prefix, media_type in _MAGIC_PREFIXES:
        if head.startswith(prefix):
            return media_type
    # WEBP is a RIFF container: "RIFF" <4-byte size> "WEBP".
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def _file_response(
    path: Path,
    headers: dict[str, str] | None = None,
    status_code: int = 200,
) -> FileResponse:
    media_type = None
    if path.suffix == ".xml":
        # Some platforms' mimetypes return text/xml for .xml; sitemap
        # consumers expect application/xml, so state it deterministically.
        media_type = "application/xml"
    elif mimetypes.guess_type(path.name)[0] is None:
        media_type = sniff_image_type(path)
    return FileResponse(path, media_type=media_type, headers=headers, status_code=status_code)


class HashedAssets(StaticFiles):
    """/_next/static filenames carry a content hash, so they cache forever."""

    async def get_response(self, path: str, scope):  # type: ignore[override]
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


def _resolve_within(root: Path, relative: str) -> Path | None:
    """Resolve ``relative`` to a real file inside ``root``.

    Rejects empty paths, parent traversal, and anything that resolves outside
    the root — ``resolve()`` plus ``is_relative_to`` also stops symlinks and
    crafted segments, not just literal "..".
    """
    if not relative or ".." in relative:
        return None
    candidate = (root / relative).resolve()
    if not candidate.is_relative_to(root):
        return None
    return candidate if candidate.is_file() else None


def _resolve_clean_url(root: Path, relative: str) -> Path | None:
    """/app resolves to app.html or app/index.html.

    Next's static export writes one form or the other depending on
    trailingSlash; accepting both means a config change cannot silently 404
    every authenticated route.
    """
    for candidate in (relative, f"{relative}.html", f"{relative}/index.html"):
        hit = _resolve_within(root, candidate)
        if hit is not None:
            return hit
    return None


def mount_static_site(app: FastAPI, static_dir: str | Path) -> bool:
    """Mount the built site at the domain root.

    Registers a catch-all, so it must be called AFTER every API route —
    matching is by registration order. Returns False and changes nothing when
    the build output is absent, which keeps API-only development and the test
    suite working untouched.
    """
    static_dir = Path(static_dir)
    index_file = static_dir / "index.html"
    if not index_file.is_file():
        return False

    root = static_dir.resolve()
    not_found_file = static_dir / "404.html"

    next_static = static_dir / "_next" / "static"
    if next_static.is_dir():
        app.mount("/_next/static", HashedAssets(directory=next_static), name="next-static")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def static_site(full_path: str) -> FileResponse:
        if full_path.startswith(RESERVED_PREFIXES):
            raise HTTPException(status_code=404, detail="Not Found")

        # /app and /app/ are the same page.
        full_path = full_path.rstrip("/")

        if not full_path:
            return _file_response(index_file, headers=NO_CACHE)

        hit = _resolve_clean_url(root, full_path)
        if hit is not None:
            headers = NO_CACHE if hit.suffix == ".html" else None
            return _file_response(hit, headers=headers)

        if not_found_file.is_file():
            return _file_response(not_found_file, headers=NO_CACHE, status_code=404)
        raise HTTPException(status_code=404, detail="Not Found")

    return True
