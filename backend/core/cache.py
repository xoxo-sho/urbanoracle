"""A tiny in-process TTL cache, replacing Next's ``next: {revalidate}``.

The upstream sources move slowly (REINFOLIB publishes quarterly, the e-Stat
census table is annual, the station GeoJSON is a committed file), so a
24-hour TTL is generous while still bounding staleness to one day.

This is a best-effort warm cache, not a correctness mechanism: with Cloud
Run scaling to zero, a cold instance simply refetches. It holds only what a
request already returns, and it never introduces non-determinism — the same
inputs produce the same payload whether the answer came from the cache or
from upstream.
"""

import time
from typing import Any

DEFAULT_TTL_SECONDS = 24 * 60 * 60

_entries: dict[str, tuple[float, Any]] = {}


def get(key: str) -> Any | None:
    entry = _entries.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if time.monotonic() >= expires_at:
        _entries.pop(key, None)
        return None
    return value


def set(key: str, value: Any, ttl: int = DEFAULT_TTL_SECONDS) -> None:  # noqa: A001
    _entries[key] = (time.monotonic() + ttl, value)


def clear() -> None:
    """Drop everything. Used by tests; harmless in production."""
    _entries.clear()
