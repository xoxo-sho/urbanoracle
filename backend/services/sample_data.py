"""Fallback datasets, generated from the frontend's src/data/sample.ts.

Regenerate with scripts/gen-sample-fallback.mjs when sample.ts changes; the
two must agree because the client uses its copy when a request fails
outright and the server uses this one when an upstream API fails.
"""

import json
from functools import lru_cache
from pathlib import Path

_PATH = Path(__file__).resolve().parents[1] / "data" / "sample_fallback.json"


@lru_cache(maxsize=1)
def _load() -> dict:
    with _PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def land_prices() -> list[dict]:
    return list(_load()["sampleLandPrices"])


def demographics() -> list[dict]:
    return list(_load()["sampleDemographics"])


def disaster_risks() -> list[dict]:
    return list(_load()["sampleDisasterRisks"])


def transport_stations() -> list[dict]:
    return list(_load()["sampleTransportStations"])
