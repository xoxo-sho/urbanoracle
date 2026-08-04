"""Serialization boundary: non-finite floats must never reach the client.

Python's ``json.dumps`` emits bare ``NaN`` / ``Infinity`` literals, which are
NOT valid JSON: the browser's ``JSON.parse`` raises a SyntaxError and the
entire panel fails to render — not just the one bad datum. (JavaScript's own
``JSON.stringify`` quietly writes ``null`` instead, which is why this class
of bug only appears after the port.)

Two treatments, chosen by what the value means:

  - **Point data → drop.** A land-price point with a non-finite price is not
    a location; plotting it would be an invented fact. ``is_finite_number``
    lets the caller filter it out upstream.
  - **Aggregate data → null, keep the row.** A ward whose population is
    suppressed in the source still exists; dropping it would silently shrink
    the map. The field becomes ``null`` and the UI renders データなし.

``json_safe`` is the last line of defense applied at the response boundary:
whatever slipped through becomes ``None`` before serialization.
"""

import math
from typing import Any


def is_finite_number(value: Any) -> bool:
    """True only for a real, finite int/float (bools are not numbers here)."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return math.isfinite(value)


def finite_or_none(value: Any) -> float | int | None:
    """Aggregate-field treatment: keep the value, or null it out."""
    return value if is_finite_number(value) else None


def json_safe(value: Any) -> Any:
    """Recursively replace non-finite floats with None.

    Applied at the response boundary so a NaN introduced anywhere upstream
    still cannot produce invalid JSON.
    """
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    return value
