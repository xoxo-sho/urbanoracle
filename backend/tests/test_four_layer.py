"""The 4-layer auto-approval matrix, including normalization proofs.

Layer order is load-bearing: Layer 1 (unverified) is unconditional, Layer 2
(allowlist) beats Layer 3 (freemail), Layer 4 approves the rest.
"""

import pytest

from core.provisioning import evaluate_activation

ALLOW = "acme.com, partner.co.jp"


@pytest.fixture()
def _domains(monkeypatch):
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_DOMAINS", ALLOW)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)  # seed defaults


@pytest.mark.parametrize(
    ("email", "verified", "want_active", "want_layer"),
    [
        # Layer 1 is unconditional: domain never rescues an unverified email.
        ("user@acme.com", False, False, "layer1-unverified"),
        ("user@gmail.com", False, False, "layer1-unverified"),
        ("user@unknowncorp.jp", False, False, "layer1-unverified"),
        # Layer 2: allowlist auto-approves.
        ("user@acme.com", True, True, "layer2-allowlist"),
        ("user@partner.co.jp", True, True, "layer2-allowlist"),
        # Layer 3: freemail pends (seed defaults active when env unset).
        ("user@gmail.com", True, False, "layer3-freemail"),
        ("user@yahoo.co.jp", True, False, "layer3-freemail"),
        ("user@proton.me", True, False, "layer3-freemail"),
        # Layer 4: unknown/custom domain auto-approves.
        ("user@unknowncorp.jp", True, True, "layer4-default"),
    ],
)
def test_matrix(_domains, email, verified, want_active, want_layer):
    assert evaluate_activation(email, verified) == (want_active, want_layer)


def test_allowlist_beats_freemail(monkeypatch):
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_DOMAINS", "gmail.com")
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    assert evaluate_activation("user@gmail.com", True) == (True, "layer2-allowlist")


@pytest.mark.parametrize(
    "variant",
    [
        "  User@ACME.COM  ",
        "user@Acme.Com",
        "USER@acme.com ",
    ],
)
def test_normalization_of_email_variants(_domains, variant):
    """Case/whitespace variants must resolve identically to the plain form —
    otherwise the allowlist is silently bypassable."""
    assert evaluate_activation(variant, True) == (True, "layer2-allowlist")


def test_normalization_of_env_entries(monkeypatch):
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_DOMAINS", "  ACME.com ,, Partner.CO.JP ")
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    assert evaluate_activation("user@acme.com", True) == (True, "layer2-allowlist")
    assert evaluate_activation("user@partner.co.jp", True) == (True, "layer2-allowlist")


def test_freemail_variant_still_pends(_domains):
    assert evaluate_activation("user@GMail.Com", True) == (False, "layer3-freemail")


def test_explicit_empty_freemail_env_is_operator_choice(monkeypatch):
    """FREEMAIL env SET to empty disables Layer 3 (explicit operator act);
    unset keeps the seed defaults."""
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.setenv("URBANORACLE_FREEMAIL_DOMAINS", "")
    assert evaluate_activation("user@gmail.com", True) == (True, "layer4-default")


def test_empty_allowlist_env_is_safe(monkeypatch):
    """Empty allowlist auto-approves nobody via Layer 2 (fail-closed read)."""
    monkeypatch.setenv("URBANORACLE_ALLOWLIST_DOMAINS", "")
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    assert evaluate_activation("user@gmail.com", True) == (False, "layer3-freemail")
