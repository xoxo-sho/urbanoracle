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

Two tables, fetched separately and classed differently by the route
(real-data plan PR 1): the census table is the answer — population, density,
age shares and the ward rows themselves — so its failure is a full failure
(503); the 2025 速報 growth table feeds ``growthRate`` only, so its failure
is a partial answer that names GROWTH_FIELD as unavailable. A suppressed cell
inside a table that did answer stays ``null``: that is データなし, not 取得失敗.
"""

import logging
from typing import Any

import httpx

from core.boundary import finite_or_none, is_finite_number
from core.config import settings

logger = logging.getLogger(__name__)

ESTAT_URL = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData"
STATS_DATA_ID = "0003448299"

# The census table above is a single time point (2020), so it cannot yield a
# growth rate — which is why growthRate was previously hard-coded to 0. e-Stat
# publishes the change rate already computed at ward level in the 2025
# preliminary count, so it is read rather than derived from two snapshots.
GROWTH_STATS_DATA_ID = "0004050417"
GROWTH_TAB_CODE = "2025_35"  # 5年間の人口増減率 (%)
# The record field the growth table fills; named in the envelope's
# ``unavailable`` list when that table did not answer.
GROWTH_FIELD = "growthRate"

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


def parse_growth_rates(values: list[dict]) -> dict[str, float | None]:
    """Pure: e-Stat VALUE rows -> {ward_code: signed percent}.

    A suppressed or unparseable cell yields None rather than 0.0: a genuine
    0% change and "not published" are different facts, and rendering the
    second as the first invents a statistic.
    """
    rates: dict[str, float | None] = {}
    for v in values:
        if v.get("@tab") != GROWTH_TAB_CODE:
            continue
        code = v.get("@area")
        if not code:
            continue
        try:
            rate = float(v.get("$"))
        except (TypeError, ValueError):
            rates[code] = None
            continue
        rates[code] = rate if is_finite_number(rate) else None
    return rates


async def _fetch_values(stats_data_id: str, *, limit: int, label: str, **extra: str) -> list[dict]:
    """One e-Stat getStatsData call for the 23 wards → its VALUE rows.

    Raises on a missing key, a non-200, or an e-Stat error status, so the
    route decides what the failure means for the answer.
    """
    api_key = settings.ESTAT_API_KEY
    if not api_key:
        raise RuntimeError("ESTAT_API_KEY is not set")

    async with httpx.AsyncClient() as client:
        response = await client.get(
            ESTAT_URL,
            params={
                "appId": api_key,
                "statsDataId": stats_data_id,
                "cdArea": ",".join(TOKYO_WARDS),
                "limit": limit,
                **extra,
            },
            timeout=30.0,
        )
    if response.status_code != 200:
        raise RuntimeError(f"e-Stat {label} error: {response.status_code}")
    body: dict[str, Any] = response.json()
    if body.get("GET_STATS_DATA", {}).get("RESULT", {}).get("STATUS") != 0:
        raise RuntimeError(f"e-Stat {label} returned an error status")
    values = body["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
    return values if isinstance(values, list) else [values]


async def fetch_growth_rates() -> dict[str, float | None]:
    """Ward growth rates from the 2025 速報 table. Raises on failure.

    Classed as a PARTIAL by the route: this table feeds growthRate only, so
    when it fails the census figures still stand and the answer names
    GROWTH_FIELD as unavailable.
    """
    values = await _fetch_values(
        GROWTH_STATS_DATA_ID, limit=1000, label="growth table", cdTab=GROWTH_TAB_CODE
    )
    return parse_growth_rates(values)


def _clamp_pct(value: float) -> float | None:
    if not is_finite_number(value):
        return None
    return max(0.0, min(100.0, value))


def transform_estat(
    values: list[dict], growth_rates: dict[str, float | None] | None = None
) -> list[dict]:
    """Pure: e-Stat VALUE rows → demographics records."""
    growth_rates = growth_rates or {}
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
                # None (not 0) when unavailable: "no data" and "no change"
                # are different facts.
                "growthRate": finite_or_none(growth_rates.get(code)),
                "ageGroups": {"young": young, "working": working, "elderly": elderly},
            }
        )

    return results


async def fetch_census() -> list[dict]:
    """The 2020 census VALUE rows for the 23 wards. Raises on failure.

    Classed as a FULL FAILURE by the route: every figure and the ward rows
    themselves come from this table, so without it there is nothing
    meaningful to show. An answer in which no ward has a usable population
    counts as a failure too — a 200 of suppressed cells is not data.
    """
    values = await _fetch_values(STATS_DATA_ID, limit=10000, label="API")
    if not any(r["population"] is not None for r in transform_estat(values)):
        raise RuntimeError("e-Stat returned no usable population data")
    return values
