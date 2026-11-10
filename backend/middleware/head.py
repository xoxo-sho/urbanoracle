"""HEAD wherever GET (RFC 9110 §9.3.2), for every route the app has.

FastAPI's ``@app.get`` registers GET only — Starlette's own ``Route`` adds HEAD
to a GET route, FastAPI's ``APIRoute`` does not — so every API route and the
site's catch-all (core/spa.py) answered HEAD with 405. In production that
showed as ``HEAD /login 405`` in the browser console whenever the landing page
was reached by client-side navigation, and to any uptime or link checker that
probes with HEAD (follow-up 2, 2026-11-10).

This answers a HEAD request by running it through the application as the GET
it describes and sending GET's status line and headers — Content-Length
included — with no body. It sits outermost, so every inner layer sees exactly
what a GET sees: auth answers 401/403 the same way, the security headers and
cache headers are the same, the static site resolves the same file. A route
that does not answer GET does not answer HEAD either (GET's 405).

Not done instead: adding HEAD to each APIRoute's methods. FastAPI would also
publish a HEAD operation per route in /api/openapi.json, with duplicate
operation ids, and a route added later would have to remember the same step.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Body-carrying response messages. pathsend is the ASGI extension a server may
# offer for files (Starlette's FileResponse uses it when offered).
_BODY_MESSAGES = {"http.response.body", "http.response.pathsend", "http.response.zerocopysend"}


class HeadAsGetMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "HEAD":
            await self.app(scope, receive, send)
            return

        done = False

        async def send_headers_only(message: Message) -> None:
            nonlocal done
            if message["type"] not in _BODY_MESSAGES:
                await send(message)
                return
            if done:
                return
            final = message["type"] != "http.response.body" or not message.get("more_body", False)
            if final:
                done = True
                await send({"type": "http.response.body", "body": b"", "more_body": False})

        await self.app({**scope, "method": "GET"}, receive, send_headers_only)
