"""Sample datasets the server still serves, generated from src/data/sample.ts.

Regenerate with scripts/gen-sample-fallback.mjs when sample.ts changes. Only
the disaster-risk set is read today: /disaster-risks has no upstream yet
(real-data plan PR 7), so it answers with this curated set and ``isLive``
False. The two live endpoints no longer fall back to sample data on failure;
they answer 503 (RECON 2026-10-uo-real-data §7, PR 1).
"""

import json
from functools import lru_cache
from pathlib import Path

_PATH = Path(__file__).resolve().parents[1] / "data" / "sample_fallback.json"


@lru_cache(maxsize=1)
def _load() -> dict:
    with _PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def disaster_risks() -> list[dict]:
    return list(_load()["sampleDisasterRisks"])
