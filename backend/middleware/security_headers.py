"""Security headers, re-emitted from FastAPI.

``next.config.ts`` declared these via ``headers()``, which a static export
cannot honor — the exported HTML is served by this app, not by the Next
server. The values below mirror that config exactly; changing one here
without changing the other is a drift bug.
"""

from starlette.middleware.base import BaseHTTPMiddleware

SECURITY_HEADERS = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        for header, value in SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
        return response
