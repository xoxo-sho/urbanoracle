"""Demographics from e-Stat (2020 census, table 0003448299).

e-Stat encodes suppressed or unavailable cells as ``"-"``, ``"***"`` and
``"X"``. The TypeScript original ran these through ``parseFloat``, producing
NaN, and its ``totalPop === 0`` guard did not catch it (``NaN === 0`` is
False) — so a suppressed ward reached the client with NaN population and
density. Under Python that would serialize as a bare ``NaN`` literal and
break ``JSON.parse`` for the whole panel.

Treatment here follows the aggregate rule: the ward is KEPT (dropping it
would silently shrink the map) and the unusable field becomes ``null``, which
the UI renders as データなし.
"""

import logging
from typing import Any

import httpx

from core.boundary import finite_or_none, is_finite_number
from core.config import settings
from services import sample_data

logger = logging.getLogger(__name__)

ESTAT_URL = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData"
STATS_DATA_ID = "0003448299"

# ward code -> (name, area km²)
TOKYO_WARDS: dict[str, tuple[str, float]] = {
    "13101": ("千代田区", 11.66),
    "13102": ("中央区", 10.21),
    "13103": ("港区", 20.37),
    "13104": ("新宿区", 18.22),
    "13105": ("文京区", 11.29),
    "13106": ("台東区", 10.11),
    "13107": ("墨田区", 13.77),
    "13108": ("江東区", 40.16),
    "13109": ("品川区", 22.84),
    "13110": ("目黒区", 14.67),
    "13111": ("大田区", 60.83),
    "13112": ("世田谷区", 58.05),
    "13113": ("渋谷区", 15.11),
    "13114": ("中野区", 15.59),
    "13115": ("杉並区", 34.06),
    "13116": ("豊島区", 13.01),
    "13117": ("北区", 20.61),
    "13118": ("荒川区", 10.16),
    "13119": ("板橋区", 32.22),
    "13120": ("練馬区", 48.08),
    "13121": ("足立区", 53.25),
    "13122": ("葛飾区", 34.80),
    "13123": ("江戸川区", 49.90),
}


def _find_value(values: list[dict], area: str, tab: str, cat01: str, cat02: str = "100") -> float:
    """Locate a cell. Returns NaN for missing/suppressed — never a silent 0.

    Returning 0.0 for "suppressed" would be a fabricated statistic; NaN
    propagates the absence so the caller can null the field.
    """
    for v in values:
        if (
            v.get("@area") == area
            and v.get("@tab") == tab
            and v.get("@cat01") == cat01
            and v.get("@cat02") == cat02
        ):
            try:
                return float(v.get("$"))
            except (TypeError, ValueError):
                # "-", "***", "X" and friends.
                return float("nan")
    return float("nan")


def _clamp_pct(value: float) -> float | None:
    if not is_finite_number(value):
        return None
    return max(0.0, min(100.0, value))


def transform_estat(values: list[dict]) -> list[dict]:
    """Pure: e-Stat VALUE rows → demographics records."""
    results: list[dict] = []

    for code, (name, area_km2) in TOKYO_WARDS.items():
        total_pop = _find_value(values, code, "020", "100")
        young_pop = _find_value(values, code, "020", "110")
        elderly_pop = _find_value(values, code, "020", "130")

        # A ward with no usable total is still a ward: keep it, null the fields.
        has_total = is_finite_number(total_pop) and total_pop > 0

        young_pct = _find_value(values, code, "105", "110")
        elderly_pct = _find_value(values, code, "105", "130")

        if not is_finite_number(young_pct) or young_pct == 0:
            if has_total and is_finite_number(young_pop):
                young_pct = round(young_pop / total_pop * 100)
            else:
                young_pct = float("nan")
        else:
            young_pct = round(young_pct)

        if not is_finite_number(elderly_pct) or elderly_pct == 0:
            if has_total and is_finite_number(elderly_pop):
                elderly_pct = round(elderly_pop / total_pop * 100)
            else:
                elderly_pct = float("nan")
        else:
            elderly_pct = round(elderly_pct)

        young = _clamp_pct(young_pct)
        elderly = _clamp_pct(elderly_pct)
        # The source's own percentages can disagree with its counts; clamping
        # keeps the working share from going negative in the chart.
        working = (
            _clamp_pct(100 - young - elderly)
            if young is not None and elderly is not None
            else None
        )

        density = round(total_pop / area_km2) if has_total else float("nan")

        results.append(
            {
                "region": name,
                "population": finite_or_none(total_pop) if has_total else None,
                "density": finite_or_none(density),
                "growthRate": 0,  # the census table carries no growth rate
                "ageGroups": {"young": young, "working": working, "elderly": elderly},
            }
        )

    return results


async def fetch_demographics() -> list[dict]:
    api_key = settings.ESTAT_API_KEY
    if not api_key:
        raise RuntimeError("ESTAT_API_KEY is not set")

    async with httpx.AsyncClient() as client:
        response = await client.get(
            ESTAT_URL,
            params={
                "appId": api_key,
                "statsDataId": STATS_DATA_ID,
                "cdArea": ",".join(TOKYO_WARDS),
                "limit": 10000,
            },
            timeout=30.0,
        )
    if response.status_code != 200:
        raise RuntimeError(f"e-Stat API error: {response.status_code}")

    body: dict[str, Any] = response.json()
    result = body.get("GET_STATS_DATA", {}).get("RESULT", {})
    if result.get("STATUS") != 0:
        raise RuntimeError("e-Stat returned an error status")

    values = body["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
    records = transform_estat(values)
    if not any(r["population"] is not None for r in records):
        raise RuntimeError("e-Stat returned no usable population data")
    return records


def fallback() -> list[dict]:
    return sample_data.demographics()
