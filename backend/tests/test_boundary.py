"""The serialization boundary must make invalid JSON impossible."""

import json

import pytest

from core.boundary import finite_or_none, is_finite_number, json_safe

NON_FINITE = [float("nan"), float("inf"), float("-inf")]


@pytest.mark.parametrize("value", NON_FINITE)
def test_non_finite_is_not_a_finite_number(value):
    assert is_finite_number(value) is False
    assert finite_or_none(value) is None


def test_finite_values_pass_through():
    assert is_finite_number(0) is True
    assert is_finite_number(-3.5) is True
    assert finite_or_none(42) == 42


def test_bools_are_not_numbers():
    # True would otherwise sail through as 1 and land in a numeric field.
    assert is_finite_number(True) is False


@pytest.mark.parametrize("value", NON_FINITE)
def test_json_safe_nulls_non_finite_nested(value):
    payload = {"data": [{"price": value, "ok": 1}], "meta": {"x": [value]}}
    safe = json_safe(payload)
    assert safe["data"][0]["price"] is None
    assert safe["data"][0]["ok"] == 1
    assert safe["meta"]["x"] == [None]


@pytest.mark.parametrize("value", NON_FINITE)
def test_json_safe_output_is_strictly_valid_json(value):
    """The property that matters: a strict parser must accept the result."""
    encoded = json.dumps(json_safe({"v": value}))
    assert json.loads(encoded, parse_constant=_reject) == {"v": None}


def test_unguarded_serialization_is_invalid_json():
    """Fault injection: WITHOUT the guard, the output is invalid JSON.

    This is the failure the guard exists to prevent — json.dumps emits a
    bare NaN literal, which a strict parser (like the browser's JSON.parse)
    rejects outright.
    """
    encoded = json.dumps({"v": float("nan")})  # no json_safe
    assert "NaN" in encoded
    with pytest.raises(ValueError):
        json.loads(encoded, parse_constant=_reject)


def _reject(constant_name):
    raise ValueError(f"invalid JSON constant: {constant_name}")
