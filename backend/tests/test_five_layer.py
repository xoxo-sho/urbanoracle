"""The 5-layer auto-approval matrix, including the individual-email allowlist.

Layer order is the security property. Two orderings matter most:

  L2 above L4 — a named freemail address is admitted WITHOUT admitting its
  domain. That is the whole point of the email allowlist, and the test that
  proves it is `test_named_freemail_address_is_admitted_but_its_domain_is_not`.

  L1 above L2 — an unverified address gets nothing from being on the
  allowlist. Otherwise typing someone else's allowlisted address into a
  sign-up form would admit you as them.
"""

import pytest

from core.provisioning import evaluate_activation

ALLOW_DOMAINS = "acme.com, partner.co.jp"
INVITED = "invited.investor@gmail.com"


@pytest.fixture()
def _rules(monkeypatch):
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_DOMAINS", ALLOW_DOMAINS)
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_EMAILS", INVITED)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)  # seed defaults


# ---------------------------------------------------------------------------
# The key case: L2 beats L4
# ---------------------------------------------------------------------------


def test_named_freemail_address_is_admitted_but_its_domain_is_not(_rules):
    """One invited gmail passes; gmail.com as a whole still pends."""
    assert evaluate_activation(INVITED, True) == (True, "layer2-email-allowlist")
    # Same domain, not invited — must still be curated.
    assert evaluate_activation("someone.else@gmail.com", True) == (False, "layer4-freemail")
    assert evaluate_activation("another@gmail.com", True) == (False, "layer4-freemail")


def test_unverified_allowlisted_email_pends(_rules):
    """L1 outranks L2 — no impersonation bypass via a known address."""
    assert evaluate_activation(INVITED, False) == (False, "layer1-unverified")


# ---------------------------------------------------------------------------
# Full matrix
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("email", "verified", "want_active", "want_layer"),
    [
        # L1 is unconditional, whatever the address.
        ("user@acme.com", False, False, "layer1-unverified"),
        ("user@gmail.com", False, False, "layer1-unverified"),
        ("user@unknowncorp.jp", False, False, "layer1-unverified"),
        (INVITED, False, False, "layer1-unverified"),
        # L2: the individually invited address.
        (INVITED, True, True, "layer2-email-allowlist"),
        # L3: domain allowlist.
        ("user@acme.com", True, True, "layer3-domain-allowlist"),
        ("user@partner.co.jp", True, True, "layer3-domain-allowlist"),
        # L4: freemail pends.
        ("user@gmail.com", True, False, "layer4-freemail"),
        ("user@yahoo.co.jp", True, False, "layer4-freemail"),
        ("user@proton.me", True, False, "layer4-freemail"),
        # L5: unknown/custom domain auto-approves.
        ("user@unknowncorp.jp", True, True, "layer5-default"),
    ],
)
def test_matrix(_rules, email, verified, want_active, want_layer):
    assert evaluate_activation(email, verified) == (want_active, want_layer)


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "variant",
    [
        "  Invited.Investor@Gmail.com  ",
        "INVITED.INVESTOR@GMAIL.COM",
        "invited.investor@GMail.Com ",
    ],
)
def test_case_and_whitespace_variants_of_an_invited_address(_rules, variant):
    """Otherwise the allowlist is bypassable — in both directions."""
    assert evaluate_activation(variant, True) == (True, "layer2-email-allowlist")


def test_env_entries_are_normalized_too(monkeypatch):
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_EMAILS", "  Invited@Example.COM ,, other@x.jp ")
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    assert evaluate_activation("invited@example.com", True) == (True, "layer2-email-allowlist")
    assert evaluate_activation("other@x.jp", True) == (True, "layer2-email-allowlist")


def test_a_near_miss_address_is_not_admitted(_rules):
    """Substring/prefix confusion must not admit a different address."""
    for near in (
        "invited.investor@gmail.com.evil.com",
        "xinvited.investor@gmail.com",
        "invited.investor+alias@gmail.com",
    ):
        active, layer = evaluate_activation(near, True)
        assert layer != "layer2-email-allowlist", near


# ---------------------------------------------------------------------------
# Empty / absent configuration
# ---------------------------------------------------------------------------


def test_empty_email_allowlist_approves_nobody(monkeypatch):
    """With L2 empty the rule behaves exactly like the previous 4 layers."""
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_EMAILS", "")
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    assert evaluate_activation("anyone@gmail.com", True) == (False, "layer4-freemail")
    assert evaluate_activation("anyone@customcorp.jp", True) == (True, "layer5-default")


def test_unset_email_allowlist_approves_nobody(monkeypatch):
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_EMAILS", raising=False)
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    assert evaluate_activation("anyone@gmail.com", True) == (False, "layer4-freemail")


# ---------------------------------------------------------------------------
# The pre-existing 4-layer behaviour, unchanged by the addition
# ---------------------------------------------------------------------------


def test_domain_allowlist_still_beats_freemail(monkeypatch):
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_DOMAINS", "gmail.com")
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_EMAILS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    assert evaluate_activation("user@gmail.com", True) == (True, "layer3-domain-allowlist")


@pytest.mark.parametrize("variant", ["  User@ACME.COM  ", "user@Acme.Com", "USER@acme.com "])
def test_domain_normalization_unchanged(_rules, variant):
    assert evaluate_activation(variant, True) == (True, "layer3-domain-allowlist")


def test_freemail_variant_still_pends(_rules):
    assert evaluate_activation("user@GMail.Com", True) == (False, "layer4-freemail")


def test_explicit_empty_freemail_env_is_operator_choice(monkeypatch):
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_EMAILS", raising=False)
    monkeypatch.setenv("URBANORACLE_FREEMAIL_DOMAINS", "")
    assert evaluate_activation("user@gmail.com", True) == (True, "layer5-default")


def test_empty_domain_allowlist_is_safe(monkeypatch):
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_DOMAINS", "")
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_EMAILS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    assert evaluate_activation("user@gmail.com", True) == (False, "layer4-freemail")
