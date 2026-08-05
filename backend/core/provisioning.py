"""Create the ``users`` row for a first-time authenticated caller (CURATED).

Anyone holding a verified identity on the shared ``dxalabs-platform`` tenant
gets a UrbanOracle *row* on their first authenticated request — but not
necessarily an *active* account. Authentication itself is unchanged: the
RS256 signature, issuer, audience and expiry are all verified upstream in
``core.gip_auth``, and an anonymous caller still gets 401. Whether the row
starts active is decided by the 5-layer rule below; ``users.is_active`` is
the PRIMARY access gate (curated model), enforced by ``core.authz``.

Provider-agnostic: the rule reads only ``sub`` / ``email`` /
``email_verified`` claims, which Google sign-in and Email/Password both
supply.

Properties this module must hold (Parallel City precedent):

**Idempotent under concurrency.** The dashboard fires several data hooks the
moment it mounts, so a user's first page load arrives as a burst of parallel
requests that each find no row and each try to create one. Exactly one
INSERT wins; the others must recognise the loser's unique-violation and
read the winner's row rather than surfacing a 500. This is the normal path
here, not an edge case.

**Narrow.** Roles are not granted (everyone starts as ``viewer``), each user
gets their own Organization (1-user-1-org), and nothing here can reach
another product: UrbanOracle only ever holds its own DATABASE_URL. A shared
identity tenant does not imply a shared user table.

THE 5-LAYER AUTO-APPROVAL RULE (first match wins, fail-closed):

    Layer 1: email_verified != true            -> is_active=False (pending)
    Layer 2: email in EMAIL allowlist          -> is_active=True  (auto-approve)
    Layer 3: domain in DOMAIN allowlist        -> is_active=True  (auto-approve)
    Layer 4: domain in FREEMAIL denylist       -> is_active=False (pending)
    Layer 5: otherwise                         -> is_active=True  (auto-approve)

Layer 2 sits ABOVE the freemail denylist on purpose: it admits one named
address without admitting its domain. Inviting an individual investor who
uses gmail must not open gmail.com to everyone, and that is exactly what
the ordering buys — every other address on that domain still pends at
Layer 4.

Layer 1 still outranks it. An unverified address that appears on the email
allowlist PENDS, and is raised only after verification completes (see
re_evaluate). Otherwise anyone able to type an allowlisted address into a
sign-up form would be admitted as its owner.

Normalization is applied identically to the full address and to the domain
(trimmed, lowercased, domain taken after the LAST '@'), on both the claim
and the configured entries. An un-normalized comparison is a silent
allowlist/denylist bypass.

Decisions are logged with the local part scrubbed, including Layer 2 hits:
knowing that an allowlisted address matched does not require writing the
address into the log.
"""

import logging
import os

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.models import Organization, User, UserRole

logger = logging.getLogger(__name__)

ALLOWLIST_ENV = "URBANORACLE_ALLOWLIST_DOMAINS"
FREEMAIL_ENV = "URBANORACLE_FREEMAIL_DOMAINS"
EMAIL_ALLOWLIST_ENV = "URBANORACLE_ALLOWLIST_EMAILS"

# Used only when FREEMAIL_ENV is unset. An operator may set it (even to an
# empty string) to take explicit control of the denylist.
SEED_FREEMAIL_DOMAINS = (
    "gmail.com",
    "googlemail.com",
    "yahoo.co.jp",
    "yahoo.com",
    "ymail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "icloud.com",
    "me.com",
    "proton.me",
    "protonmail.com",
    "aol.com",
    "gmx.com",
)


class ProvisioningRefusedError(Exception):
    """The identity cannot be turned into a UrbanOracle account at all.

    Raised for claims that cannot satisfy the schema (missing sub/email) and
    for an email already registered under a different sign-in identity.
    Callers translate this into a 401. This is distinct from "pending": a
    pending user is a validly provisioned row with is_active=False (403 at
    the second gate), not a refusal.
    """


def _normalize_email(email: str) -> str:
    """The whole address, trimmed and lowercased."""
    return email.strip().lower()


def _normalize_domain(email: str) -> str:
    """Substring after the LAST '@', lowercased, trimmed."""
    return email.strip().rsplit("@", 1)[-1].strip().lower()


def _domains_from_env(var: str, default: tuple[str, ...] = ()) -> set[str]:
    raw = os.environ.get(var)
    entries = default if raw is None else raw.split(",")
    return {d.strip().lower() for d in entries if d.strip()}


def _allowlist() -> set[str]:
    return _domains_from_env(ALLOWLIST_ENV)


def _allowlisted_emails() -> set[str]:
    """Individually invited addresses. Empty (the default) approves nobody."""
    raw = os.environ.get(EMAIL_ALLOWLIST_ENV)
    entries = () if raw is None else raw.split(",")
    return {_normalize_email(e) for e in entries if e.strip()}


def _freemail() -> set[str]:
    return _domains_from_env(FREEMAIL_ENV, default=SEED_FREEMAIL_DOMAINS)


def _scrubbed(email: str) -> str:
    return f"***@{_normalize_domain(email)}"


def evaluate_activation(email: str, email_verified: bool) -> tuple[bool, str]:
    """Run the 5-layer rule. Returns (is_active, deciding_layer)."""
    # L1 is unconditional: no claim about an address counts until the address
    # has been proven to belong to the caller.
    if not email_verified:
        return False, "layer1-unverified"
    if _normalize_email(email) in _allowlisted_emails():
        return True, "layer2-email-allowlist"
    domain = _normalize_domain(email)
    if domain in _allowlist():
        return True, "layer3-domain-allowlist"
    if domain in _freemail():
        return False, "layer4-freemail"
    return True, "layer5-default"


def re_evaluate(user: User) -> User:
    """Re-run the 5-layer rule for an existing user. RAISE-ONLY.

    May lift is_active false->true (e.g. after email verification completes,
    or after the allowlist widens). MUST NOT lower true->false: tightening
    the allowlist never revokes an already-approved user — deactivation is a
    deliberate manual act, not a side effect of a config change.

    Does not commit; the caller owns the transaction.
    """
    active, layer = evaluate_activation(user.email, user.email_verified)
    if active and not user.is_active:
        user.is_active = True
        logger.info(
            "re-evaluation activated user %s (decided by %s)",
            _scrubbed(user.email),
            layer,
        )
    elif not active and user.is_active:
        logger.info(
            "re-evaluation would deactivate %s (%s) — suppressed by the "
            "no-downgrade rule",
            _scrubbed(user.email),
            layer,
        )
    return user


def _read_existing(session: Session, auth_uid: str) -> User | None:
    """Post-conflict recovery read. Split out so tests can fault-inject the
    'no unique-violation handling' failure mode."""
    return session.scalar(select(User).where(User.auth_uid == auth_uid))


def ensure_user(session: Session, claims: dict) -> User:
    """Return the users row for verified claims, creating it if needed."""
    auth_uid = str(claims.get("sub") or "").strip()
    email_raw = str(claims.get("email") or "").strip()
    email_verified = bool(claims.get("email_verified", False))

    if not auth_uid or not email_raw or "@" not in email_raw:
        raise ProvisioningRefusedError("claims lack a usable sub/email")

    # Stored lowercased so the email UNIQUE constraint cannot be dodged by
    # case variants of the same address.
    email = email_raw.lower()

    user = session.scalar(select(User).where(User.auth_uid == auth_uid))
    if user is not None:
        # Email-verification completion upgrade: an Email/Password user who
        # verified since last login gets re-evaluated (raise-only).
        if email_verified and not user.email_verified:
            user.email_verified = True
            re_evaluate(user)
            session.commit()
        return user

    active, layer = evaluate_activation(email, email_verified)
    org = Organization(name=email)
    user = User(
        organization=org,
        auth_uid=auth_uid,
        email=email,
        email_verified=email_verified,
        role=UserRole.viewer.value,
        is_active=active,
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        # Concurrent first load: another request inserted the row between our
        # SELECT and COMMIT. The loser adopts the winner's row — never a 500.
        session.rollback()
        winner = _read_existing(session, auth_uid)
        if winner is not None:
            logger.info(
                "provisioning race for %s resolved to the winner's row",
                _scrubbed(email),
            )
            return winner
        # No row under this auth_uid ⇒ the collision was the email UNIQUE
        # constraint: same address, different sign-in identity. Refusing is
        # always safe; guessing at an account is not.
        raise ProvisioningRefusedError(
            "email already registered under a different sign-in identity"
        )

    logger.info(
        "provisioned %s: is_active=%s (decided by %s)",
        _scrubbed(email),
        active,
        layer,
    )
    return user
