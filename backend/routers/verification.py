"""POST /api/v1/auth/verification-email — UrbanOracle's verification mail for
the signed-in, UNVERIFIED caller. The work is services/verification_email.py's;
this module is the route: who may call it, what it takes, what it answers.

  1. a missing or invalid token -> 401 (core.authz.require_token_claims, the
     same 401s as every other route)
  2. a token whose email_verified is True -> 409 already_verified
  3. a token with no email claim -> 400 no_email
  4. then the ledger, the Identity Toolkit, Resend (verification_email.py):
     200 {"sent": true, "retry_after": 60}, 429 cooldown / daily_limit with
     retry_after and a Retry-After header, 503 verification_unavailable,
     502 email_send_failed

The recipient is ALWAYS the token's email claim — never anything in the body,
whose only field is the mail's language (a strict model: any other field is a
422). The route provisions nothing: an unverified caller gets no users row and
no organizations row (core.provisioning runs only behind get_current_user, and
main.py mounts this router outside `authenticated`).

A plain `def`, not `async def`: the service holds a database transaction and
makes two outbound HTTP calls synchronously, so FastAPI runs it in the
threadpool and uvicorn's event loop stays free.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from core.authz import require_token_claims
from core.database import get_session
from services.verification_email import Refused, send_verification_email

router = APIRouter()


class VerificationEmailRequest(BaseModel):
    """The mail's language. Nothing else: the address comes from the token."""

    model_config = ConfigDict(extra="forbid")

    lang: Literal["ja", "en"]


class VerificationEmailSent(BaseModel):
    sent: bool
    retry_after: int


@router.post("/auth/verification-email", response_model=VerificationEmailSent)
def send_verification_mail(
    body: VerificationEmailRequest,
    claims: dict = Depends(require_token_claims),
    session: Session = Depends(get_session),
):
    if claims.get("email_verified") is True:
        raise HTTPException(status_code=409, detail="already_verified")
    email = claims.get("email")
    if not isinstance(email, str) or not email:
        raise HTTPException(status_code=400, detail="no_email")
    outcome = send_verification_email(session, uid=str(claims["sub"]), email=email, lang=body.lang)
    if isinstance(outcome, Refused):
        content: dict[str, object] = {"detail": outcome.detail}
        headers = None
        if outcome.retry_after is not None:
            content["retry_after"] = outcome.retry_after
            headers = {"Retry-After": str(outcome.retry_after)}
        return JSONResponse(status_code=outcome.status, content=content, headers=headers)
    return VerificationEmailSent(sent=True, retry_after=outcome.retry_after)
