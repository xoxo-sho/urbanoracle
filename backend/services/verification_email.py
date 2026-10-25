"""UrbanOracle's own verification mail, behind POST /api/v1/auth/verification-email
(routers/verification.py).

Until Stage 2 the browser asked Firebase for the shared tenant's templated mail,
whose link opened Firebase's hosted page. This module sends a UrbanOracle mail
instead, through the Resend API, with a link to UrbanOracle's own /auth/action:

  1. In ONE transaction under a per-uid advisory lock: a send less than 60 s
     ago -> 429 cooldown; five sends in the last 24 h -> 429 daily_limit (until
     the oldest of those five leaves the window). Both carry retry_after.
  2. No RESEND_API_KEY -> 503 verification_unavailable (logged).
  3. The link is generated with the Identity Toolkit REST call — exactly what
     firebase-admin would do, without the dependency (D1): the runtime service
     account's access token from the metadata server (cached until 60 s before
     it expires), then POST accounts:sendOobCode with returnOobLink on the
     shared GIP project. It sends nothing. Metadata unreachable, a non-2xx
     answer, a transport error, or an answer without oobLink -> 503.
  4. The oobCode is taken from that link and a new link is built on
     UrbanOracle's domain: {PUBLIC_BASE_URL}/auth/action?mode=verifyEmail&oobCode=…&lang=…
     No oobCode -> 503.
  5. The mail is posted to Resend; a non-2xx answer or a transport error -> 502.
  6. The send is recorded, the uid's rows older than seven days are deleted,
     and the transaction commits -> 200.

Every refusal and failure rolls back, so a row exists only for a mail Resend
accepted, and the advisory lock makes two concurrent requests for one uid
serialise on step 1 — the cooldown cannot be raced. Nothing logged or returned
carries the address, a link, the oobCode, the key or the access token: Resend
failures are logged by status and Resend's error `name` only, and the Identity
Toolkit's error message has every address replaced by "[email]".

Sync throughout, like the rest of this backend (core/database.py's Session):
the route is a plain `def` (FastAPI runs it in the threadpool), the REST calls
use httpx.Client, and the three client factories plus the token provider are
module attributes so tests fake them at the seam. Ported in shape from Parti
(backend/verification_email.py @origin/main).
"""

import logging
import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx
from sqlalchemy import delete, insert, select, text
from sqlalchemy.orm import Session

from core.config import settings
from db.models import VerificationEmailSend
from services.verification_email_templates import render_verification_email

logger = logging.getLogger(__name__)

COOLDOWN = timedelta(seconds=60)
DAILY_WINDOW = timedelta(hours=24)
DAILY_LIMIT = 5
RETENTION = timedelta(days=7)
RESEND_TIMEOUT_SECONDS = 10
IDENTITY_TIMEOUT_SECONDS = 10
METADATA_TIMEOUT_SECONDS = 5
# The access token is refreshed this long before the metadata server says it expires.
TOKEN_REFRESH_MARGIN = timedelta(seconds=60)

METADATA_TOKEN_URL = (
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
)
IDENTITY_TOOLKIT_BASE_URL = "https://identitytoolkit.googleapis.com/v1"

Lang = Literal["ja", "en"]

_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended(:uid, 0))")
_RESEND_ERROR_NAME = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# The three outbound clients. Module-level factories so tests swap in an
# httpx.MockTransport without touching the code paths they exercise.


def metadata_client() -> httpx.Client:
    return httpx.Client(timeout=METADATA_TIMEOUT_SECONDS)


def identity_client() -> httpx.Client:
    return httpx.Client(timeout=IDENTITY_TIMEOUT_SECONDS)


def resend_client() -> httpx.Client:
    return httpx.Client(timeout=RESEND_TIMEOUT_SECONDS)


# ---------------------------------------------------------------------------
# The runtime service account's access token (metadata server)
# ---------------------------------------------------------------------------


class TokenUnavailable(Exception):
    """The metadata server did not hand out a usable access token."""


class MetadataTokenProvider:
    """GET the default service account's token from the metadata server and
    cache it until TOKEN_REFRESH_MARGIN before `expires_in` runs out.

    On Cloud Run the default service account IS the runtime identity
    (urbanoracle-run@), the one the verificationLinkSender role is bound to.
    The message of every failure names only the failure class or HTTP status,
    never the token.
    """

    def __init__(self) -> None:
        self._token: str | None = None
        self._expires_at: datetime | None = None

    def reset(self) -> None:
        self._token = None
        self._expires_at = None

    def get(self) -> str:
        now = utcnow()
        if self._token and self._expires_at is not None and now < self._expires_at:
            return self._token
        try:
            with metadata_client() as client:
                response = client.get(METADATA_TOKEN_URL, headers={"Metadata-Flavor": "Google"})
        except httpx.HTTPError as exc:
            raise TokenUnavailable(f"metadata token request failed: {type(exc).__name__}") from exc
        if not response.is_success:
            raise TokenUnavailable(f"metadata token request failed: status={response.status_code}")
        try:
            body = response.json()
        except ValueError as exc:
            raise TokenUnavailable("metadata token response is not JSON") from exc
        token = body.get("access_token") if isinstance(body, dict) else None
        if not isinstance(token, str) or not token:
            raise TokenUnavailable("metadata token response carries no access_token")
        try:
            lifetime = timedelta(seconds=float(body.get("expires_in", 0)))
        except (TypeError, ValueError):
            lifetime = timedelta(0)
        self._token = token
        self._expires_at = now + lifetime - TOKEN_REFRESH_MARGIN
        return token


token_provider = MetadataTokenProvider()


# ---------------------------------------------------------------------------
# Outcomes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Sent:
    retry_after: int


@dataclass(frozen=True)
class Refused:
    status: int
    detail: str
    retry_after: int | None = None


Outcome = Sent | Refused

UNAVAILABLE = Refused(503, "verification_unavailable")
SEND_FAILED = Refused(502, "email_send_failed")


# ---------------------------------------------------------------------------
# The send
# ---------------------------------------------------------------------------


def send_verification_email(session: Session, *, uid: str, email: str, lang: Lang) -> Outcome:
    """Send UrbanOracle's verification mail to `email` — the token's own address."""
    now = utcnow()
    committed = False
    try:
        session.execute(_LOCK, {"uid": uid})
        outcome = _send_locked(session, uid=uid, email=email, lang=lang, now=now)
        if isinstance(outcome, Sent):
            session.execute(insert(VerificationEmailSend).values(auth_uid=uid, sent_at=now))
            session.execute(
                delete(VerificationEmailSend).where(
                    VerificationEmailSend.auth_uid == uid,
                    VerificationEmailSend.sent_at < now - RETENTION,
                )
            )
            session.commit()
            committed = True
            logger.info("verification email sent: uid=%s lang=%s", uid, lang)
        return outcome
    finally:
        if not committed:
            # Every refusal and failure — and any exception — ends the
            # transaction here, releasing the advisory lock and leaving no row.
            session.rollback()


def _send_locked(session: Session, *, uid: str, email: str, lang: Lang, now: datetime) -> Outcome:
    recent = list(
        session.execute(
            select(VerificationEmailSend.sent_at)
            .where(
                VerificationEmailSend.auth_uid == uid,
                VerificationEmailSend.sent_at > now - DAILY_WINDOW,
            )
            .order_by(VerificationEmailSend.sent_at.desc())
        ).scalars()
    )
    if recent and now - recent[0] < COOLDOWN:
        return Refused(429, "cooldown", _seconds_until(recent[0] + COOLDOWN, now))
    if len(recent) >= DAILY_LIMIT:
        oldest_counted = recent[DAILY_LIMIT - 1]
        return Refused(429, "daily_limit", _seconds_until(oldest_counted + DAILY_WINDOW, now))

    api_key = settings.RESEND_API_KEY
    if not api_key:
        logger.error("RESEND_API_KEY is not configured")
        return UNAVAILABLE

    firebase_link = generate_verification_link(email)
    if firebase_link is None:
        return UNAVAILABLE

    oob_code = _oob_code(firebase_link)
    if not oob_code:
        logger.error("verification link generation failed: the link carries no oobCode")
        return UNAVAILABLE

    link = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/auth/action?" + urlencode(
        {"mode": "verifyEmail", "oobCode": oob_code, "lang": lang}
    )
    mail = render_verification_email(lang, email=email, link=link)
    accepted = _post_to_resend(
        api_key=api_key,
        idempotency_key=f"verify-{uid}-{int(now.timestamp() * 1000)}",
        payload={
            "from": settings.VERIFICATION_EMAIL_FROM,
            "to": [email],
            "reply_to": settings.VERIFICATION_EMAIL_REPLY_TO,
            "subject": mail.subject,
            "html": mail.html,
            "text": mail.text,
        },
    )
    return Sent(int(COOLDOWN.total_seconds())) if accepted else SEND_FAILED


# ---------------------------------------------------------------------------
# The link (Identity Toolkit REST, D1)
# ---------------------------------------------------------------------------


def generate_verification_link(email: str) -> str | None:
    """The tenant's verification link for `email`, generated (not sent) by
    POST accounts:sendOobCode with returnOobLink — the call firebase-admin's
    generate_email_verification_link makes. None, logged, on any failure."""
    try:
        access_token = token_provider.get()
    except TokenUnavailable as exc:
        logger.error("verification link generation failed: %s", exc)
        return None

    url = f"{IDENTITY_TOOLKIT_BASE_URL}/projects/{settings.GIP_PROJECT_ID}/accounts:sendOobCode"
    payload = {"requestType": "VERIFY_EMAIL", "email": email, "returnOobLink": True}
    try:
        with identity_client() as client:
            response = client.post(
                url, json=payload, headers={"Authorization": f"Bearer {access_token}"}
            )
    except httpx.HTTPError as exc:
        logger.error("verification link generation failed: status=None error=%s", type(exc).__name__)
        return None
    if not response.is_success:
        logger.error(
            "verification link generation failed: status=%s message=%s",
            response.status_code,
            _redacted(_error_message(response), email),
        )
        return None
    try:
        body = response.json()
    except ValueError:
        body = None
    link = body.get("oobLink") if isinstance(body, dict) else None
    if not isinstance(link, str) or not link:
        logger.error("verification link generation failed: the response carries no oobLink")
        return None
    return link


# ---------------------------------------------------------------------------
# Resend
# ---------------------------------------------------------------------------


def _post_to_resend(*, api_key: str, idempotency_key: str, payload: dict) -> bool:
    url = f"{settings.RESEND_API_BASE_URL.rstrip('/')}/emails"
    headers = {"Authorization": f"Bearer {api_key}", "Idempotency-Key": idempotency_key}
    try:
        with resend_client() as client:
            response = client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        logger.error(
            "verification email send failed: status=None resend_error=%s", type(exc).__name__
        )
        return False
    if response.is_success:
        return True
    logger.error(
        "verification email send failed: status=%s resend_error=%s",
        response.status_code,
        _resend_error_name(response),
    )
    return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seconds_until(moment: datetime, now: datetime) -> int:
    return max(1, math.ceil((moment - now).total_seconds()))


def _oob_code(firebase_link: str) -> str | None:
    try:
        values = parse_qs(urlsplit(firebase_link).query).get("oobCode", [])
    except ValueError:
        return None
    return values[0] if values and values[0] else None


def _resend_error_name(response: httpx.Response) -> str:
    """Resend's machine-readable error name — never its free-text message,
    which can echo the address."""
    try:
        body = response.json()
    except ValueError:
        return "unparseable"
    name = body.get("name") if isinstance(body, dict) else None
    return name if isinstance(name, str) and _RESEND_ERROR_NAME.match(name) else "unknown"


def _error_message(response: httpx.Response) -> str:
    """The Identity Toolkit's `error.message`, or "" when the body has none."""
    try:
        body = response.json()
    except ValueError:
        return ""
    error = body.get("error") if isinstance(body, dict) else None
    message = error.get("message") if isinstance(error, dict) else None
    return message if isinstance(message, str) else ""


def _redacted(message: str, email: str) -> str:
    """`message` with the caller's address — and any other address — replaced."""
    if email:
        message = re.compile(re.escape(email), re.IGNORECASE).sub("[email]", message)
    message = _EMAIL_RE.sub("[email]", message)
    return message[:300]
