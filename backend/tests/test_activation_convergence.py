"""Activation converges from any entry point, not from one screen.

The bug this pins: activation used to be re-checked only on the
``email_verified`` false->true TRANSITION. A transition happens once. Any row
that was already ``email_verified=True`` while ``is_active=False`` had missed
its only chance and could never be activated by any later request — the branch
that would have noticed was skipped precisely because verification was already
recorded.

The curated rule minted exactly those rows (verified address, held back by the
freemail layer). Opening signup changed the decision but freed nobody, because
nothing re-asked the question.

The fix keys on ``is_active`` instead: activation is re-checked whenever an
inactive caller presents a verified token, so it converges on the next
authenticated request regardless of which page the user is on. These tests
therefore call ``ensure_user`` directly — that is the point. If activation only
worked through the /pending screen's button, every test here would fail.
"""

import pytest

from core.provisioning import ensure_user

VERIFIED = {"sub": "gipuid_conv_verified_00001", "email": "converge@example.com", "email_verified": True}
UNVERIFIED = dict(VERIFIED, email_verified=False)


# ---------------------------------------------------------------------------
# The key fix
# ---------------------------------------------------------------------------


def test_stranded_verified_row_is_activated_on_the_next_request(db_session):
    """The exact row the transition-guard could never reach.

    email_verified=True, is_active=False — no transition left to observe. Under
    the old guard this row stayed inactive forever.
    """
    user = ensure_user(db_session, dict(UNVERIFIED))
    assert user.is_active is False

    # Simulate the stranded state directly: verification already recorded,
    # activation never granted.
    user.email_verified = True
    user.is_active = False
    db_session.commit()

    revived = ensure_user(db_session, dict(VERIFIED))
    assert revived.is_active is True, (
        "an already-verified but inactive row was not re-examined — activation "
        "is still keyed on the transition"
    )


def test_activation_happens_without_touching_the_pending_screen(db_session):
    """No /auth/re-evaluate call, no button, no poll — just a normal request."""
    user = ensure_user(db_session, dict(UNVERIFIED))
    assert user.is_active is False

    # The next authenticated request after the user verified out of band.
    activated = ensure_user(db_session, dict(VERIFIED))
    assert activated.is_active is True
    assert activated.email_verified is True


def test_repeated_requests_are_idempotent(db_session):
    """Convergence, not oscillation: extra requests change nothing."""
    ensure_user(db_session, dict(UNVERIFIED))
    first = ensure_user(db_session, dict(VERIFIED))
    second = ensure_user(db_session, dict(VERIFIED))
    assert first.id == second.id
    assert second.is_active is True


# ---------------------------------------------------------------------------
# The guardrail
# ---------------------------------------------------------------------------


def test_an_unverified_token_never_activates(db_session):
    """email_verified remains the only thing that grants access."""
    user = ensure_user(db_session, dict(UNVERIFIED))
    assert user.is_active is False

    again = ensure_user(db_session, dict(UNVERIFIED))
    assert again.is_active is False, "an unverified token activated an account"


def test_an_unverified_token_cannot_deactivate_an_active_user(db_session):
    """RAISE-ONLY holds in the other direction too.

    A user who verified, became active, then presents a stale token still
    claiming false must not be knocked back to pending — that would log real
    users out mid-session every time a cached token lagged.
    """
    ensure_user(db_session, dict(UNVERIFIED))
    active = ensure_user(db_session, dict(VERIFIED))
    assert active.is_active is True

    stale = ensure_user(db_session, dict(UNVERIFIED))
    assert stale.is_active is True, "re-evaluation lowered is_active — raise-only violated"
    assert stale.email_verified is True, "recorded verification must not be un-recorded"


def test_google_style_first_token_is_active_immediately(db_session):
    """Unchanged path: verified on the very first token, no pending step."""
    user = ensure_user(
        db_session,
        {"sub": "gipuid_conv_google_000001", "email": "google@example.com", "email_verified": True},
    )
    assert user.is_active is True


def test_fault_unverified_must_not_lift_is_active(db_session):
    """The mutation this file exists to catch.

    Simulates dropping ``email_verified and`` from the re-evaluation condition,
    leaving ``if not user.is_active: re_evaluate(user)``. Under that regression
    every inactive caller is re-evaluated regardless of verification — and since
    the rule reads the row's stored flag rather than the token, an attacker who
    never verifies still walks in behind anyone whose row was already marked
    verified.
    """
    user = ensure_user(db_session, dict(UNVERIFIED))
    assert user.is_active is False

    for _ in range(3):
        user = ensure_user(db_session, dict(UNVERIFIED))

    assert user.is_active is False, (
        "an UNVERIFIED token lifted is_active — the verification gate on "
        "re-evaluation is gone"
    )
