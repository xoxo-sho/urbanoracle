"""Account state for the signed-in caller.

These routes sit behind ``get_current_user`` but deliberately NOT behind
``require_active``: the only person who needs them is one whose account is
still pending, and putting them behind the activation gate would make the
upgrade path unreachable by exactly the people it exists for.

Nothing here grants access. ``re_evaluate`` re-runs the 4-layer rule, which
can raise is_active false->true and can never lower it (core.provisioning).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.authz import get_current_user
from core.database import get_session
from core.provisioning import re_evaluate
from db.models import User

router = APIRouter()


def _state(user: User) -> dict:
    return {
        "status": "active" if user.is_active else "pending_activation",
        "email_verified": user.email_verified,
        "role": user.role,
    }


@router.get("/auth/me")
async def me(user: User = Depends(get_current_user)) -> dict:
    return _state(user)


@router.post("/auth/re-evaluate")
async def re_evaluate_account(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Re-run the activation rule for the caller.

    The client calls this after it observes that email verification has
    completed: a user held at Layer 1 purely for being unverified can be
    raised without waiting for a manual review that was never required.
    """
    re_evaluate(user)
    session.commit()
    return _state(user)
