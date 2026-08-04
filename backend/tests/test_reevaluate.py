"""Re-evaluation: raise-only, never revoke.

Covers the Email/Password journey: sign-up unverified (Layer 1 pending),
verify email, next login upgrades to active; and proves a tightened
allowlist cannot drop an already-active user.
"""

import pytest

from core.provisioning import ensure_user, re_evaluate

CLAIMS_UNVERIFIED = {
    "sub": "gipuid_reevaluate_test_00001",
    "email": "member@acme.com",
    "email_verified": False,
}


@pytest.fixture()
def _allow_acme(monkeypatch):
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_DOMAINS", "acme.com")
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)


def test_unverified_allowlist_user_starts_pending(db_session, _allow_acme):
    user = ensure_user(db_session, dict(CLAIMS_UNVERIFIED))
    assert user.email_verified is False
    assert user.is_active is False  # Layer 1 wins regardless of allowlist


def test_verification_flip_then_reevaluate_activates(db_session, _allow_acme):
    user = ensure_user(db_session, dict(CLAIMS_UNVERIFIED))
    assert user.is_active is False

    user.email_verified = True
    re_evaluate(user)
    db_session.commit()

    assert user.is_active is True


def test_next_login_with_verified_claim_upgrades(db_session, _allow_acme):
    """The ensure_user path itself performs the upgrade on the next request
    whose token carries email_verified=true."""
    ensure_user(db_session, dict(CLAIMS_UNVERIFIED))

    verified_claims = dict(CLAIMS_UNVERIFIED, email_verified=True)
    user = ensure_user(db_session, verified_claims)

    assert user.email_verified is True
    assert user.is_active is True


def test_tightened_allowlist_does_not_revoke(db_session, _allow_acme, monkeypatch):
    user = ensure_user(db_session, dict(CLAIMS_UNVERIFIED, email_verified=True))
    assert user.is_active is True

    # Operator removes acme.com from the allowlist; acme.com is not freemail,
    # so the rule would now say... still True (layer4). Tighten harder: make
    # the domain pend outright via the freemail list.
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_DOMAINS", "")
    monkeypatch.setenv("URBANORACLE_FREEMAIL_DOMAINS", "acme.com")

    re_evaluate(user)
    db_session.commit()

    assert user.is_active is True, "re_evaluate must never lower true->false"
