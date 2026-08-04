"""Concurrent first-load provisioning: one winner, zero 500s.

The fault-injection companion proves the property is load-bearing: with the
unique-violation recovery disabled, the same concurrent burst DOES surface
errors — i.e. the happy-path test would catch a regression that removed the
recovery, rather than passing vacuously.
"""

import threading
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import func, select

import core.provisioning as provisioning
from db.models import Organization, User

CLAIMS = {
    "sub": "gipuid_concurrency_test_0001",
    "email": "burst@example.co.jp",
    "email_verified": True,
}

N = 6


def _burst(session_factory, monkeypatched=None):
    """Fire N ensure_user calls that all start together. Returns (users, errors)."""
    barrier = threading.Barrier(N)
    results, errors = [], []

    def attempt():
        session = session_factory()
        try:
            barrier.wait(timeout=10)
            results.append(provisioning.ensure_user(session, dict(CLAIMS)))
        except Exception as exc:  # noqa: BLE001 — the test inspects every failure
            errors.append(exc)
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=N) as pool:
        for _ in range(N):
            pool.submit(attempt)

    return results, errors


def test_concurrent_first_load_is_idempotent(db_session, session_factory):
    results, errors = _burst(session_factory)

    assert errors == [], f"concurrent provisioning must never error: {errors!r}"
    assert len(results) == N

    assert db_session.scalar(select(func.count()).select_from(User)) == 1
    assert db_session.scalar(select(func.count()).select_from(Organization)) == 1

    ids = {u.id for u in results}
    assert len(ids) == 1, "every caller must resolve to the winner's row"


def test_fault_injection_without_conflict_recovery(db_session, session_factory, monkeypatch):
    """Disable the loser's recovery read — the burst must now surface errors.

    This is the proof that the happy-path assertions are not vacuous: a
    provisioning implementation lacking unique-violation handling cannot
    pass test_concurrent_first_load_is_idempotent.
    """

    def broken_read(session, auth_uid):
        raise AssertionError("conflict recovery disabled by fault injection")

    monkeypatch.setattr(provisioning, "_read_existing", broken_read)

    results, errors = _burst(session_factory)

    # Exactly one thread wins the INSERT; with recovery disabled, at least
    # one loser must blow up instead of adopting the winner's row.
    assert len(errors) >= 1, (
        "with conflict recovery disabled the burst produced no errors — "
        "the idempotency test would pass even without recovery, i.e. it "
        "proves nothing"
    )
    assert db_session.scalar(select(func.count()).select_from(User)) == 1
