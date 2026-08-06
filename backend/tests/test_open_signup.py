"""Open self-signup: a verified email is the whole rule.

Replaces test_five_layer.py. That suite proved an ordering between five
layers; there is one layer now, so the interesting properties changed shape:

  * the OPEN case — addresses that used to pend (gmail and friends) must now
    activate, which is the behaviour change the product asked for;
  * the GUARDRAIL case — unverified must still not activate, which is now the
    only thing standing between a stranger and an active account.

The second is the one worth fault-injecting. Deleting four layers removed
four chances to catch a mistake, so the remaining check has to be tested like
it is load-bearing, because it is.
"""

import pytest

from core.provisioning import evaluate_activation

# The freemail domains the old Layer 4 pended, plus a corporate address that
# Layer 5 already admitted. Post-change every one of them activates, and that
# uniformity IS the feature — no address is more welcome than another.
FORMERLY_PENDED = [
    "user@gmail.com",
    "user@googlemail.com",
    "user@yahoo.co.jp",
    "user@outlook.com",
    "user@hotmail.com",
    "user@icloud.com",
    "user@proton.me",
    "user@gmx.com",
]


@pytest.mark.parametrize("email", FORMERLY_PENDED)
def test_verified_freemail_is_now_active(email):
    """The open case: a gmail that pended at Layer 4 is admitted."""
    assert evaluate_activation(email, True) == (True, "verified")


@pytest.mark.parametrize(
    "email",
    ["user@acme.com", "user@unknowncorp.jp", "user@partner.co.jp", "x@sub.domain.example"],
)
def test_verified_corporate_is_active(email):
    assert evaluate_activation(email, True) == (True, "verified")


# ---------------------------------------------------------------------------
# The guardrail. If these go green with the check removed, the suite is
# decorative — see test_fault_unverified_must_not_activate below.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("email", FORMERLY_PENDED + ["user@acme.com"])
def test_unverified_never_activates(email):
    """Verification is the only gate, and it holds for every address shape."""
    assert evaluate_activation(email, False) == (False, "unverified")


@pytest.mark.parametrize("falsy", [False, None, 0, "", [], {}])
def test_non_true_verification_claims_fail_closed(falsy):
    """A missing or malformed claim is unverified, not verified.

    ``email_verified`` arrives from a JWT, so it can be absent, null, or a
    string. Anything that is not a true boolean must land on the closed side;
    a truthiness bug here reads as "verified" for a claim that said nothing.
    """
    active, reason = evaluate_activation("user@example.com", falsy)
    assert (active, reason) == (False, "unverified")


def test_a_truthy_string_claim_would_activate_so_coercion_must_stay_upstream():
    """Records where the real protection lives — deliberately NOT here.

    ``bool("false")`` is True in Python, so if a raw JSON string ever reached
    this function it would activate. This function cannot defend against that
    and does not pretend to: ``ensure_user`` collapses the claim with
    ``bool(claims.get("email_verified", False))`` before calling, and that
    coercion is the guard. Asserting the hazard here means anyone who moves
    or relaxes that coercion meets a test that explains what they just broke.
    """
    assert evaluate_activation("user@example.com", "false") == (True, "verified")


def test_the_address_cannot_influence_the_decision():
    """No allowlist survived. Two different addresses, same verification, same answer."""
    a = evaluate_activation("invited.investor@gmail.com", True)
    b = evaluate_activation("stranger@gmail.com", True)
    assert a == b == (True, "verified")

    c = evaluate_activation("invited.investor@gmail.com", False)
    d = evaluate_activation("stranger@gmail.com", False)
    assert c == d == (False, "unverified")


def test_no_environment_variable_can_change_the_outcome(monkeypatch):
    """The retired env vars must be inert, not merely unset in production.

    A leftover reader would make the rule configurable again — the exact trap
    the deletion was meant to remove. Setting all three to values that used to
    flip the decision must change nothing.
    """
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_DOMAINS", "acme.com")
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_EMAILS", "invited@gmail.com")
    monkeypatch.setenv("URBANORACLE_FREEMAIL_DOMAINS", "acme.com,gmail.com")

    # Under the old rule: acme.com -> L3 active, gmail -> L4 pending.
    assert evaluate_activation("user@acme.com", True) == (True, "verified")
    assert evaluate_activation("user@gmail.com", True) == (True, "verified")
    assert evaluate_activation("invited@gmail.com", False) == (False, "unverified")


def test_the_deleted_helpers_are_gone():
    """Deleted, not disabled. A dormant allowlist is a trap for the next reader."""
    import core.provisioning as p

    for name in (
        "_allowlist",
        "_allowlisted_emails",
        "_freemail",
        "_domains_from_env",
        "SEED_FREEMAIL_DOMAINS",
        "ALLOWLIST_ENV",
        "FREEMAIL_ENV",
        "EMAIL_ALLOWLIST_ENV",
    ):
        assert not hasattr(p, name), f"{name} survived the open-up — remove it"


def test_fault_unverified_must_not_activate():
    """The mutation this file exists to catch.

    Simulates the one-character regression `if not email_verified` ->
    `if email_verified`, or the check being dropped entirely. Under either,
    an unverified caller activates and the guardrail is gone. Asserting the
    real function disagrees with the broken one keeps the test honest even if
    someone "fixes" the expected values elsewhere in this file.
    """

    def broken(email: str, email_verified: bool) -> tuple[bool, str]:
        return True, "verified"  # the guardrail removed

    real = evaluate_activation("stranger@example.com", False)
    assert real != broken("stranger@example.com", False), (
        "evaluate_activation activates an UNVERIFIED address — the only "
        "remaining guardrail is gone"
    )
    assert real == (False, "unverified")
