"""Land prices from REINFOLIB XIT001.

Two behaviors are deliberate and differ from the TypeScript original:

**Non-finite prices are dropped.** ``int("非公表")`` fails and a malformed
record used to sail past the ``<= 0`` guard as NaN (``NaN <= 0`` is False),
reaching the client as a point with a null price. A price that is not a
number is not a data point, so it is discarded rather than plotted.

**The coordinate offset is deterministic.** REINFOLIB returns NO coordinate
of any kind (see docs/stage3-port-plan.md): every point is a ward centroid
from WARD_COORDS, spread out so that up to five points per ward do not stack
on one pixel. The original spread used Math.random(), so the map moved on
every refresh and the response could not be cached or tested. The offset is
now derived from a stable key (ward code + district), which keeps the visual
spread and makes the same district land on the same spot forever.

The displayed position is therefore an approximation at ward scale — the UI
says so next to the layer.
"""

import asyncio
import hashlib
import logging
from typing import Any

import httpx

from core.boundary import is_finite_number
from core.config import settings
from services import sample_data

logger = logging.getLogger(__name__)

XIT001_URL = "https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001"
YEAR = 2024
MAX_POINTS_PER_WARD = 5
# ±0.0075° ≈ ±830m lat / ±680m lng — ward-scale spread, matching the original.
JITTER_RANGE = 0.015

TARGET_WARDS = (
    "13101",  # 千代田区
    "13102",  # 中央区
    "13103",  # 港区
    "13104",  # 新宿区
    "13113",  # 渋谷区
    "13116",  # 豊島区
    "13110",  # 目黒区
    "13109",  # 品川区
)

WARD_COORDS: dict[str, tuple[float, float]] = {
    "13101": (35.6940, 139.7536),
    "13102": (35.6706, 139.7727),
    "13103": (35.6581, 139.7514),
    "13104": (35.6938, 139.7035),
    "13113": (35.6640, 139.6982),
    "13116": (35.7263, 139.7161),
    "13110": (35.6413, 139.6980),
    "13109": (35.6090, 139.7300),
}
DEFAULT_COORD = (35.68, 139.76)


def deterministic_offset(seed_key: str, axis: str) -> float:
    """A stable pseudo-random offset in [-JITTER_RANGE/2, +JITTER_RANGE/2).

    Same key → same offset, forever, on every instance.
    """
    digest = hashlib.sha256(f"{seed_key}|{axis}".encode()).digest()
    # 32 bits of the digest mapped onto the range.
    unit = int.from_bytes(digest[:4], "big") / 2**32
    return (unit - 0.5) * JITTER_RANGE


def _to_int(raw: Any) -> float:
    """Parse an integer-ish string the way the source data actually arrives.

    Commas are stripped first: int("1,000,000") raises, and the JS original's
    parseInt("1,000,000") silently returned 1 — both wrong for the same input.
    Returns NaN when the value is not a number at all, which the caller drops.
    """
    try:
        return int(str(raw).replace(",", "").strip())
    except (TypeError, ValueError):
        return float("nan")


def transform_ward_records(ward_code: str, records: list[dict]) -> list[dict]:
    """Pure: REINFOLIB records → land-price points. No I/O, no randomness."""
    lat0, lng0 = WARD_COORDS.get(ward_code, DEFAULT_COORD)
    municipality = (records[0].get("Municipality") or "") if records else ""

    seen: set[str] = set()
    points: list[dict] = []

    for item in records:
        trade_price = item.get("TradePrice")
        if not trade_price:
            continue
        district = item.get("DistrictName") or ""
        if district in seen:
            continue
        seen.add(district)

        price = _to_int(trade_price)
        area = _to_int(item.get("Area"))
        # A zero/unparseable area would divide by zero; the original coerced
        # it to 1 with `|| 1`, which silently reported the whole trade price
        # as a per-square-metre figure. Skipping is the honest answer.
        if not is_finite_number(area) or area <= 0 or not is_finite_number(price):
            logger.debug("dropping record with unusable price/area in ward %s", ward_code)
            continue

        price_per_sqm = round(price / area)
        if not is_finite_number(price_per_sqm) or price_per_sqm <= 0:
            continue

        seed = f"{ward_code}|{district}"
        points.append(
            {
                "id": f"lp-{ward_code}-{len(points)}",
                "lat": lat0 + deterministic_offset(seed, "lat"),
                "lng": lng0 + deterministic_offset(seed, "lng"),
                "price": price_per_sqm,
                "year": YEAR,
                "address": f"東京都{municipality}{district}",
                "landUse": item.get("CityPlanning") or item.get("Use") or "その他",
            }
        )
        if len(points) >= MAX_POINTS_PER_WARD:
            break

    return points


async def _fetch_ward(client: httpx.AsyncClient, ward_code: str, api_key: str) -> list[dict]:
    response = await client.get(
        XIT001_URL,
        params={"area": ward_code, "year": YEAR},
        headers={"Ocp-Apim-Subscription-Key": api_key},
        timeout=30.0,
    )
    if response.status_code != 200:
        return []
    body = response.json()
    if body.get("status") != "OK" or not body.get("data"):
        return []
    return transform_ward_records(ward_code, body["data"])


async def fetch_land_prices() -> list[dict]:
    """Live fetch across the target wards. Raises if nothing is retrievable."""
    api_key = settings.REINFOLIB_API_KEY
    if not api_key:
        raise RuntimeError("REINFOLIB_API_KEY is not set")

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *(_fetch_ward(client, code, api_key) for code in TARGET_WARDS),
            return_exceptions=True,
        )

    points: list[dict] = []
    for result in results:
        if isinstance(result, BaseException):
            # Per-ward failure is tolerated; the ward simply contributes nothing.
            logger.warning("a ward fetch failed: %s", type(result).__name__)
            continue
        points.extend(result)

    if not points:
        raise RuntimeError("no land price data retrieved")
    return points


def fallback() -> list[dict]:
    return sample_data.land_prices()
