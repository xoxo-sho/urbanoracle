"""Re-registration: same address, new sign-in identity.

A user deleted from the IdP — by themselves or by an operator — who signs up
again gets a brand-new uid. Their ``users`` row survives, still bound to the
dead uid, and ``users.email`` is UNIQUE. Before the rebind branch this was a
permanent lockout: the INSERT collided, provisioning refused, and the caller
got a 401 that bounced them to /login. The account was unreachable by the only
person who could prove they owned the address.

The fix and the vulnerability are the same code path. "Same address, new uid"
describes both the returning owner and someone claiming an address they do not
own, and nothing in the request distinguishes them except ``email_verified``.
So that flag is not a detail here — it is the entire security boundary, and
these tests treat it that way.
"""

import pytest

from core.provisioning import ProvisioningRefusedError, ensure_user

EMAIL = "returning.user@example.com"

ORIGINAL = {"sub": "gipuid_rereg_original_00001", "email": EMAIL, "email_verified": True}
# Same address, different identity — what the IdP issues after a delete + re-signup.
REBORN_VERIFIED = {"sub": "gipuid_rereg_reborn_000001", "email": EMAIL, "email_verified": True}
REBORN_UNVERIFIED = {"sub": "gipuid_rereg_reborn_000001", "email": EMAIL, "email_verified": False}


def _seed(db_session):
    """The pre-existing account, active and verified."""
    user = ensure_user(db_session, dict(ORIGINAL))
    assert user.auth_uid == ORIGINAL["sub"]
    assert user.is_active is True
    return user


# ---------------------------------------------------------------------------
# The fix
# ---------------------------------------------------------------------------


def test_verified_reregistration_rebinds_the_existing_row(db_session):
    """The returning owner reaches their account instead of a permanent 401."""
    original = _seed(db_session)
    original_id = original.id
    original_org = original.org_id

    reborn = ensure_user(db_session, dict(REBORN_VERIFIED))

    assert reborn.id == original_id, "must rebind the existing row, not create a second"
    assert reborn.auth_uid == REBORN_VERIFIED["sub"], "auth_uid must move to the new identity"
    assert reborn.email == EMAIL
    assert reborn.is_active is True, "a verified returning user lands active (no /login bounce)"
    assert reborn.org_id == original_org, "the organization travels with the row"


def test_rebinding_does_not_duplicate_the_row_or_org(db_session):
    """users.email is UNIQUE; the rebind must respect that rather than dodge it."""
    from db.models import Organization, User

    _seed(db_session)
    ensure_user(db_session, dict(REBORN_VERIFIED))

    assert db_session.query(User).filter(User.email == EMAIL).count() == 1
    assert db_session.query(Organization).count() == 1


def test_the_old_identity_no_longer_resolves(db_session):
    """After a rebind the dead uid owns nothing — it cannot resurrect the account."""
    from db.models import User

    _seed(db_session)
    ensure_user(db_session, dict(REBORN_VERIFIED))

    assert db_session.query(User).filter(User.auth_uid == ORIGINAL["sub"]).count() == 0


# ---------------------------------------------------------------------------
# The guardrail. These are the tests that matter.
# ---------------------------------------------------------------------------


def test_unverified_reregistration_is_refused(db_session):
    """An unproven claim on someone else's address must not rebind."""
    _seed(db_session)

    with pytest.raises(ProvisioningRefusedError):
        ensure_user(db_session, dict(REBORN_UNVERIFIED))


def test_a_refused_rebind_leaves_the_original_row_untouched(db_session):
    """Refusing is not enough — the attempt must not damage the account either.

    A partial write here would be worse than a lockout: the row could end up
    bound to the attacker's uid, or deactivated, with the refusal masking it.
    """
    original = _seed(db_session)
    original_uid = original.auth_uid

    with pytest.raises(ProvisioningRefusedError):
        ensure_user(db_session, dict(REBORN_UNVERIFIED))

    db_session.expire_all()
    from db.models import User

    row = db_session.query(User).filter(User.email == EMAIL).one()
    assert row.auth_uid == original_uid, "the attacker's uid must not be written"
    assert row.is_active is True, "the legitimate owner must not be locked out"
    assert row.email_verified is True


def test_fault_unverified_must_not_take_over_an_existing_email(db_session):
    """The mutation this file exists to catch.

    Simulates dropping the ``if not email_verified`` gate on the rebind branch.
    Under that regression, anyone who signs up with an address already in the
    table inherits the row, its organization and its active status — an account
    takeover requiring nothing but knowledge of the address.

    Asserting the refusal is what the real code does, rather than trusting the
    expected values elsewhere in this file, keeps the test honest.
    """
    _seed(db_session)

    took_over = True
    try:
        ensure_user(db_session, dict(REBORN_UNVERIFIED))
    except ProvisioningRefusedError:
        took_over = False

    assert took_over is False, (
        "an UNVERIFIED identity rebound an existing email's row — this is "
        "account takeover, not re-registration"
    )


# ---------------------------------------------------------------------------
# The paths that must not have changed
# ---------------------------------------------------------------------------


def test_a_brand_new_email_still_provisions_fresh(db_session):
    """The rebind branch must be unreachable for an address nobody holds."""
    user = ensure_user(
        db_session,
        {"sub": "gipuid_rereg_brandnew_0001", "email": "nobody@example.com", "email_verified": True},
    )
    assert user.is_active is True
    assert user.auth_uid == "gipuid_rereg_brandnew_0001"


def test_an_unverified_brand_new_email_still_pends(db_session):
    """Unverified + unheld address is the ordinary signup path, not a refusal."""
    user = ensure_user(
        db_session,
        {"sub": "gipuid_rereg_newpend_00001", "email": "pending@example.com", "email_verified": False},
    )
    assert user.is_active is False


def test_the_same_identity_returning_is_unchanged(db_session):
    """The common case — same uid, same address — must not touch the rebind path."""
    original = _seed(db_session)
    again = ensure_user(db_session, dict(ORIGINAL))
    assert again.id == original.id
    assert again.auth_uid == ORIGINAL["sub"]
    assert again.is_active is True
