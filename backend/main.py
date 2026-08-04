"""UrbanOracle API.

Protection is the default and the exception is an explicit one-line diff:
every data router is mounted under a parent that depends on
``require_active``, so adding a router without thinking about auth still
gets both gates (token verification, then the curated is_active check).
Only ``/api/v1/health`` is public.

There is no CORS middleware: the frontend is a static export served from
this same origin, so there is no legitimate cross-origin caller.
"""

from fastapi import APIRouter, Depends, FastAPI

from core.authz import register_authz_handlers, require_active
from middleware.security_headers import SecurityHeadersMiddleware
from routers.data import router as data_router
from routers.health import router as health_router

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
