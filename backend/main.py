"""UrbanOracle API.

Protection is the default and the exception is an explicit one-line diff:
every data router is mounted under a parent that depends on
``require_active``, so adding a router without thinking about auth still
gets both gates (token verification, then the curated is_active check).
Only ``/api/v1/health`` is public.

There is no CORS middleware: the frontend is a static export served from
this same origin, so there is no legitimate cross-origin caller.
"""

import logging

from fastapi import APIRouter, Depends, FastAPI

from core.authz import get_current_user, register_authz_handlers, require_active
from core.config import settings
from core.spa import mount_static_site
from middleware.security_headers import SecurityHeadersMiddleware
from routers.auth import router as auth_router
from routers.data import router as data_router
from routers.health import router as health_router

# uvicorn configures only its own loggers, so application logger.info() calls
# were being dropped and never reached Cloud Run — which silently removed the
# provisioning audit trail (which layer admitted which scrubbed address).
# Only WARNING and above were surfacing. This attaches a handler to the root
# logger at INFO so the audit trail is visible in production.
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s %(name)s %(message)s",
    force=True,
)

app = FastAPI(
    title="UrbanOracle API",
    description="東京23区の都市データ可視化ダッシュボード",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# next.config.ts's headers() cannot survive a static export; these are the
# same four values, re-emitted here.
app.add_middleware(SecurityHeadersMiddleware)
register_authz_handlers(app)

app.include_router(health_router, prefix="/api/v1")

protected = APIRouter(prefix="/api/v1", dependencies=[Depends(require_active)])
protected.include_router(data_router)
app.include_router(protected)

# Account-state routes require a verified identity but NOT an active account:
# a pending user has to be able to ask for re-evaluation, which is the whole
# point of the upgrade path. They expose no data — only the caller's own state.
authenticated = APIRouter(prefix="/api/v1", dependencies=[Depends(get_current_user)])
authenticated.include_router(auth_router)
app.include_router(authenticated)

# The built front-end registers a catch-all, so it must come after every API
# route — matching is by registration order. With no build output present
# (API-only development, the test suite) this is a no-op.
if settings.STATIC_DIR:
    mount_static_site(app, settings.STATIC_DIR)
