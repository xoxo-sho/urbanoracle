"""The request-side gates: authentication (401) and activation (403).

Gate 1 — ``get_current_user``: verifies the bearer token (core.gip_auth) and
ensures a provisioned row exists (core.provisioning). Anything short of a
verified, provisionable identity is a 401.

Gate 2 — ``require_active``: layered ON TOP; requires ``is_active=true``.
A validly authenticated, provisioned, but pending user gets 403 with the
structured body ``{"status": "pending_activation"}`` so the frontend can
route to an "under review" screen.

The two outcomes are deliberately distinct: 401 = we don't know who you
are; 403+pending = we know exactly who you are and the answer is "not yet".
"""

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from core.database import get_session
from core.gip_auth import decode_auth_token
from core.provisioning import ProvisioningRefusedError, ensure_user
from db.models import User

_bearer = HTTPBearer(auto_error=False)


class PendingActivationError(Exception):
    """Authenticated + provisioned, but is_active is false."""


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_auth_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        return ensure_user(session, payload)
    except ProvisioningRefusedError:
        # Refused ≠ pending: this identity cannot have an account at all.
        raise HTTPException(status_code=401, detail="Identity not provisionable")


def require_active(user: User = Depends(get_current_user)) -> User:
    if not user.is_active:
        raise PendingActivationError()
    return user


def register_authz_handlers(app: FastAPI) -> None:
    """Install the 403 pending_activation handler on the app."""

    @app.exception_handler(PendingActivationError)
    async def _pending_activation(_: Request, __: PendingActivationError):
        return JSONResponse(status_code=403, content={"status": "pending_activation"})
