"""Demographics from e-Stat: the 令和7年国勢調査 人口等基本集計（確報）, one vintage.

Three tables of the same tabulation (公表 2026-09-29), all for the 23 特別区
(real-data plan PR 2, RECON 2026-10-uo-real-data §9 row 2; the fixture README
under tests/fixtures/census_2025/ records the provenance):

* ``0004065881`` 集計結果（原数値） 男女別人口 — the 2025 population total.
* ``0004066221`` 不詳補完値 男女、年齢（3区分）… 人口構成比［年齢別］ — the three age
  shares. The 不詳補完値 table is used because its shares sum to 100; the
  原数値 shares keep 年齢「不詳」 in the denominator, and the official 結果の概要
  reports the 不詳補完値 ones.
* ``0004065882`` 集計結果（原数値） …5年間の人口増減率… — the growth rate,
  2020年（組替）→ 2025. (The same table carries 面積（参考） and 人口密度, which
  equal the area constants and the density computed below.)

Density is the 2025 population over the ward's area in the 国土地理院
全国都道府県市区町村別面積調 whose reference date is the census date
(令和7年10月1日時点): TOKYO_WARDS holds those 23 areas, and e-Stat's own
人口密度 column is the same quotient.

e-Stat encodes suppressed or unavailable cells as ``"-"``, ``"***"`` and
``"X"``. A suppressed cell nulls the FIELD and keeps the ward (dropping it
would silently shrink the map); the UI renders null as データなし. A bare
``NaN`` must never reach the JSON (it would break ``JSON.parse`` for the
whole panel), so non-finite values become None at the record boundary.

Two classes of failure, decided by the route (PR 1's contract): the
population and age tables are the answer — population, density, age shares
and the ward rows themselves — so either failing is a full failure (503);
the growth table feeds ``growthRate`` only, so its failure is a partial
answer that names GROWTH_FIELD as unavailable. Each table is cached on its
own by the route, and only when it answered.

The envelope also carries SOURCES: for each census field the year, the
e-Stat table and a label, so every figure on screen can say which vintage it
is and the 成長率 tile can name its own table.
"""

import logging
from typing import Any

import httpx

from core.boundary import finite_or_none, is_finite_number
from core.config import settings

logger = logging.getLogger(__name__)

ESTAT_URL = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData"

CENSUS_YEAR = 2025
CENSUS_NAME = "令和7年国勢調査 人口等基本集計"

# 男女別人口－全国、都道府県、市区町村（集計結果（原数値））
POPULATION_STATS_DATA_ID = "0004065881"
POPULATION_TAB = "2025_01"  # 人口 (人)
SEX_TOTAL = "0"  # cat01 男女: 総数

# 男女、年齢（3区分）、国籍総数か日本人別人口構成比［年齢別］（不詳補完値）
AGE_STATS_DATA_ID = "0004066221"
AGE_SHARE_TAB = "2025_42"  # 人口構成比［年齢別］ (％)
NATIONALITY_TOTAL = "0"  # cat01 国籍総数か日本人: 国籍総数
AGE_SEX_TOTAL = "0"  # cat02 男女: 総数
AGE_CODES = {"young": "1", "working": "2", "elderly": "3"}  # cat03: 15歳未満 / 15～64歳 / 65歳以上

# 2020年（令和2年）の人口（組替）、…、5年間の人口増減率、…、面積（参考）及び人口密度（集計結果（原数値））
GROWTH_STATS_DATA_ID = "0004065882"
GROWTH_TAB_CODE = "2025_35"  # 5年間の人口増減率 (％)
# The record field the growth table fills; named in the envelope's
# ``unavailable`` list when that table did not answer.
GROWTH_FIELD = "growthRate"

AREA_PUBLISHER = "国土地理院"
AREA_EDITION = "令和7年全国都道府県市区町村別面積調（10月1日時点）"

# ward code -> (name, area km²) — AREA_EDITION, reference date 2025-10-01,
# column 令和7年10月1日(k㎡) of the official CSV. Equal to e-Stat 面積（参考）
# (table 0004065882, tab 2025_47) for all 23 wards. The 面積調 marks 千代田区,
# 中央区, 港区, 葛飾区 and 江戸川区 as 参考値 (境界の一部が未定) and excludes the
# 荒川河口部 from 江東区 and 江戸川区 (it is counted in the 特別区部 total only).
TOKYO_WARDS: dict[str, tuple[str, float]] = {
    "13101": ("千代田区", 11.66),
    "13102": ("中央区", 10.21),
    "13103": ("港区", 20.36),
    "13104": ("新宿区", 18.22),
    "13105": ("文京区", 11.29),
    "13106": ("台東区", 10.11),
    "13107": ("墨田区", 13.77),
    "13108": ("江東区", 42.99),
    "13109": ("品川区", 22.85),
    "13110": ("目黒区", 14.67),
    "13111": ("大田区", 61.86),
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

# What the envelope says about each census field: the year, the e-Stat table
# and a label a reader can check against e-Stat. Keyed by record field.
SOURCES: dict[str, dict[str, Any]] = {
    "population": {
        "year": CENSUS_YEAR,
        "table": POPULATION_STATS_DATA_ID,
        "label": f"{CENSUS_NAME}（確報）男女別人口",
    },
    "density": {
        "year": CENSUS_YEAR,
        "table": POPULATION_STATS_DATA_ID,
        "label": f"{CENSUS_NAME}（確報）人口 ÷ {AREA_PUBLISHER} {AREA_EDITION}",
    },
    "ageGroups": {
        "year": CENSUS_YEAR,
        "table": AGE_STATS_DATA_ID,
        "label": f"{CENSUS_NAME} 不詳補完値 年齢（3区分）人口構成比",
    },
    GROWTH_FIELD: {
        "year": CENSUS_YEAR,
        "table": GROWTH_STATS_DATA_ID,
        "label": f"{CENSUS_NAME}（確報）5年間の人口増減率（2020年→{CENSUS_YEAR}年）",
    },
}


def _cell(raw: Any) -> float | None:
    """One e-Stat cell → float, or None for "-", "***", "X" and friends.

    None, never 0.0: a suppressed cell and a genuine zero are different
    facts, and rendering the first as the second invents a statistic.
    """
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if is_finite_number(value) else None


def parse_population(values: list[dict]) -> dict[str, float | None]:
    """Pure: VALUE rows of the population table -> {ward_code: 人口 総数}."""
    totals: dict[str, float | None] = {}
    for v in values:
        if v.get("@tab") != POPULATION_TAB or v.get("@cat01") != SEX_TOTAL:
            continue
        code = v.get("@area")
        if code:
            totals[code] = _cell(v.get("$"))
    return totals


def parse_age_shares(values: list[dict]) -> dict[str, dict[str, float | None]]:
    """Pure: VALUE rows of the 不詳補完値 table -> {ward_code: {young, working, elderly}} in %."""
    by_cat = {cat: key for key, cat in AGE_CODES.items()}
    shares: dict[str, dict[str, float | None]] = {}
    for v in values:
        if (
            v.get("@tab") != AGE_SHARE_TAB
            or v.get("@cat01") != NATIONALITY_TOTAL
            or v.get("@cat02") != AGE_SEX_TOTAL
        ):
            continue
        key = by_cat.get(v.get("@cat03"))
        code = v.get("@area")
        if key is None or not code:
            continue
        shares.setdefault(code, {})[key] = _cell(v.get("$"))
    return shares


def parse_growth_rates(values: list[dict]) -> dict[str, float | None]:
    """Pure: VALUE rows of the growth table -> {ward_code: signed percent}."""
    rates: dict[str, float | None] = {}
    for v in values:
        if v.get("@tab") != GROWTH_TAB_CODE:
            continue
        code = v.get("@area")
        if code:
            rates[code] = _cell(v.get("$"))
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


async def fetch_population() -> dict[str, float | None]:
    """Ward population totals from the 確報 population table. Raises on failure.

    Classed as a FULL FAILURE by the route. An answer in which no ward has a
    usable total counts as a failure too — a 200 of suppressed cells is not
    data.
    """
    values = await _fetch_values(
        POPULATION_STATS_DATA_ID, limit=1000, label="population table", cdCat01=SEX_TOTAL
    )
    totals = parse_population(values)
    if not any(t is not None and t > 0 for t in totals.values()):
        raise RuntimeError("e-Stat returned no usable population data")
    return totals


async def fetch_age_shares() -> dict[str, dict[str, float | None]]:
    """Ward age shares from the 不詳補完値 table. Raises on failure.

    Classed as a FULL FAILURE by the route: the age shares are part of the
    answer, not an extra.
    """
    values = await _fetch_values(
        AGE_STATS_DATA_ID,
        limit=1000,
        label="age table",
        cdCat01=NATIONALITY_TOTAL,
        cdCat02=AGE_SEX_TOTAL,
    )
    return parse_age_shares(values)


async def fetch_growth_rates() -> dict[str, float | None]:
    """Ward growth rates from the 確報 table. Raises on failure.

    Classed as a PARTIAL by the route: this table feeds growthRate only, so
    when it fails the other figures still stand and the answer names
    GROWTH_FIELD as unavailable.
    """
    values = await _fetch_values(
        GROWTH_STATS_DATA_ID, limit=1000, label="growth table", cdTab=GROWTH_TAB_CODE
    )
    return parse_growth_rates(values)


def _share_pct(value: float | None) -> int | None:
    """A published share, rounded to a whole percent and kept within 0–100."""
    if value is None or not is_finite_number(value):
        return None
    return int(max(0, min(100, round(value))))


def transform_census(
    population: dict[str, float | None],
    age_shares: dict[str, dict[str, float | None]],
    growth_rates: dict[str, float | None] | None = None,
) -> list[dict]:
    """Pure: the three parsed tables → one record per ward, every ward present."""
    growth_rates = growth_rates or {}
    results: list[dict] = []

    for code, (name, area_km2) in TOKYO_WARDS.items():
        total = population.get(code)
        # A ward with no usable total is still a ward: keep it, null the fields.
        has_total = total is not None and is_finite_number(total) and total > 0
        shares = age_shares.get(code, {})

        results.append(
            {
                "region": name,
                "population": finite_or_none(total) if has_total else None,
                "density": round(total / area_km2) if has_total else None,
                # None (not 0) when unavailable: "no data" and "no change"
                # are different facts.
                GROWTH_FIELD: finite_or_none(growth_rates.get(code)),
                "ageGroups": {key: _share_pct(shares.get(key)) for key in AGE_CODES},
            }
        )

    return results


def sources_for(unavailable: list[str] | None = None) -> dict[str, dict[str, Any]]:
    """The SOURCES entries for the fields this answer carries: nothing on
    screen to attribute for a field the upstream did not deliver."""
    dropped = set(unavailable or [])
    return {field: dict(src) for field, src in SOURCES.items() if field not in dropped}
