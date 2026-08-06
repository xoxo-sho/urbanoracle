"""Create the ``users`` row for a first-time authenticated caller (OPEN).

Anyone holding a verified identity on the shared ``dxalabs-platform`` tenant
gets a UrbanOracle *row* on their first authenticated request, and — once the
address is verified — an *active* account. Authentication itself is unchanged:
the RS256 signature, issuer, audience and expiry are all verified upstream in
``core.gip_auth``, and an anonymous caller still gets 401. Whether the row
starts active is decided by the single rule below; ``users.is_active`` remains
the PRIMARY access gate, enforced by ``core.authz``.

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

THE RULE: A VERIFIED EMAIL, AND NOTHING ELSE.

    email_verified != true  -> is_active=False  (must verify first)
    email_verified == true  -> is_active=True   (open self-signup)

Registration is open. Anyone who proves control of an email address gets a
working account; there is no curation, no invite, no allowlist and no
freemail denylist. What used to be a five-layer rule collapsed to its first
layer when the product opened up, and the four layers below it were deleted
rather than disabled — a dormant allowlist is a trap for whoever reads this
next.

**Verification is now the ONLY guardrail, so it is load-bearing.** Before,
an unverified address merely lost a race against later layers; now it is the
single thing standing between a stranger and an active account. Anyone who
can type an address they do not own must not inherit it. `test_open_signup`
fault-injects exactly this: flip the check and the suite goes red.

Verification arrives late. Email/Password users sign up unverified and
confirm out of band, so ``re_evaluate`` raises them false->true when the
verified claim shows up (see below). Google sign-in supplies
``email_verified: true`` on the first token, so those users are active
immediately.

**Re-registration.** ``users.email`` is UNIQUE and rows are keyed on
``auth_uid``, so a user deleted from the IdP who signs up again arrives with a
new uid and collides with their own surviving row. That used to be a permanent
lockout. ``ensure_user`` now rebinds the row to the new identity — but only
when the incoming token is verified, because "same address, new uid" is also
exactly what an account takeover looks like. See the branch for the reasoning.

Decisions are logged with the local part scrubbed: knowing that an address
was activated does not require writing the address into the log.
"""

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.models import Organization, User, UserRole

logger = logging.getLogger(__name__)


class ProvisioningRefusedError(Exception):
    """The identity cannot be turned into a UrbanOracle account at all.

    Raised for claims that cannot satisfy the schema (missing sub/email) and
    for an email already registered under a different sign-in identity.
    Callers translate this into a 401. This is distinct from "pending": a
    pending user is a validly provisioned row with is_active=False (403 at
    the second gate), not a refusal.
    """


def _normalize_domain(email: str) -> str:
    """Substring after the LAST '@', lowercased, trimmed."""
    return email.strip().rsplit("@", 1)[-1].strip().lower()


def _scrubbed(email: str) -> str:
    return f"***@{_normalize_domain(email)}"


def evaluate_activation(email: str, email_verified: bool) -> tuple[bool, str]:
    """Verified email in, active account out. Returns (is_active, reason).

    ``email`` is unused by the decision and kept only so callers and the log
    line keep a single signature; the address never influences whether the
    account activates. That is the point of an open product — no address,
    domain or provider is treated as more welcome than another.

    Fail-closed: anything that is not an explicit True is unverified.
    """
    if not email_verified:
        return False, "unverified"
    return True, "verified"


def re_evaluate(user: User) -> User:
    """Re-check an existing user against the rule. RAISE-ONLY.

    Lifts is_active false->true once email verification completes — the whole
    reason an Email/Password signup is not a dead end. MUST NOT lower
    true->false: deactivation is a deliberate manual act, never a side effect
    of re-evaluation. The guard stays even though nothing can currently
    demand a downgrade, because the day something can, the safe behaviour
    should already be the implemented one.

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
        changed = False

        # Record verification the first time a token proves it.
        if email_verified and not user.email_verified:
            user.email_verified = True
            changed = True

        # Activation is re-checked whenever the caller is INACTIVE and the token
        # proves verification — deliberately not only on the false->true
        # transition above.
        #
        # Keying on the transition leaves a row stranded: anything already
        # email_verified=True but is_active=False is never re-examined, because
        # the transition has already happened and cannot happen twice. The
        # curated rule produced exactly those rows (verified address, held back
        # by the freemail layer), and opening signup did not free them — every
        # later request skipped the branch that would have noticed.
        #
        # Checking is_active instead makes activation a property of the current
        # state rather than of a moment that may have already passed, so it
        # converges on the next authenticated request from any entry point.
        if email_verified and not user.is_active:
            re_evaluate(user)  # raise-only: can lift false->true, never lower
            changed = True

        if changed:
            session.commit()
        return user

    # No row under this uid. Before creating one, check whether the ADDRESS is
    # already held by a different sign-in identity — ``users.email`` is UNIQUE,
    # so an INSERT would fail anyway; the question is what to do about it.
    #
    # The legitimate case is re-registration: a user deleted from the IdP (or
    # who deleted themselves) signs up again with the same address and receives
    # a brand-new uid. Their row survives, still bound to the dead uid, and
    # without this branch they are refused forever — the account is unreachable
    # by the only person who can prove they own the address.
    #
    # The dangerous case is identical in shape: someone signing up with an
    # address they do not own, hoping to inherit the row and its organization.
    #
    # ``email_verified`` is the ONLY thing separating them, so it gates the
    # rebind. Proving control of the address is exactly the evidence needed to
    # be handed what that address already owns.
    existing = session.scalar(select(User).where(User.email == email))
    if existing is not None:
        if not email_verified:
            # Deliberately a refusal, not a pending row: we cannot create one
            # (email is UNIQUE) and we must not rebind on an unproven claim.
            # A genuine returning user reaches the branch below the moment they
            # verify — one extra sign-in, versus handing over an account.
            logger.info(
                "refused rebind of %s: incoming identity has not verified the address",
                _scrubbed(email),
            )
            raise ProvisioningRefusedError(
                "email already registered under a different sign-in identity"
            )

        existing.auth_uid = auth_uid
        existing.email_verified = True
        # re_evaluate rather than assigning is_active directly: it is raise-only,
        # so a row that was deactivated by hand is not silently reactivated by
        # someone re-registering. (No ban feature exists today; this keeps the
        # property from being lost the day one does.)
        re_evaluate(existing)
        session.commit()
        logger.info(
            "rebound %s to a new verified sign-in identity (is_active=%s)",
            _scrubbed(email),
            existing.is_active,
        )
        return existing

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
