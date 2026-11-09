"""The data endpoints: the live census call and the five committed snapshots —
人口推移 (real-data plan PR 3), 駅別乗降客数 (PR 4), 地価公示 (PR 5), 用途地域
(PR 6) and 災害 (PR 7).

Envelope: ``{"status": "ok" | "partial", "data": [...], "isLive": bool}``.
``status`` says whether the request got everything it asked for; ``isLive``
says whether the figures came from the upstream source (every route does
since PR 7; nothing serves a sample set). A partial answer
adds ``unavailable``: the record fields the upstream did not deliver, so the
client renders those cells as 取得失敗 and keeps データなし for a cell the
upstream genuinely has no figure for. A /demographics answer carries
``sources``: per census field, the year and the e-Stat table the figure came
from, so the screen can say which vintage every figure is (real-data plan
PR 2). The /population-trends answer carries the same shape keyed by year;
the /transport answer carries it per field (ridership, stations, wards): the
国土数値情報 edition each came from; the /land-prices answer per field (price,
change): the 地価公示 edition; the /zoning answer per field (zoning, wards,
asOf): the 都市計画決定情報 edition, the ward polygons and the data list the
時点 is read from — and, beside ``data``, the 23区 composition as ``total``.

A failure is HTTP 503 with the body ``{"status": "unavailable"}`` and nothing
else — never sample values (RECON 2026-10-uo-real-data §7, PR 1). A 200 would
hide an upstream outage from Cloud Run's error metrics. Nothing incomplete is
remembered as complete: each upstream is cached on its own and only when it
answered, so a partial answer reuses the healthy part and retries the failed
upstream on the next request, and a 503 retries everything.

The REINFOLIB endpoint that once sat at /land-prices was removed: its data
was fetched but nothing on screen ever drew it (RECON 2026-10-data-terms §7.1
UO-3). The path now serves the committed 地価公示 snapshot (PR 5) and no
network call is made for it.

Every response goes through ``json_safe`` — the last line of defense against
a non-finite float reaching the client as an invalid-JSON ``NaN`` literal.
"""

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core import cache
from core.boundary import json_safe
from core.config import settings
from services import demographics, disaster_risks, green_land_use, land_prices, population_trends, transport, zoning

logger = logging.getLogger(__name__)

router = APIRouter()

UNAVAILABLE_HTTP_STATUS = 503


def _envelope(
    data: list[dict],
    *,
    is_live: bool,
    status: str = "ok",
    unavailable: list[str] | None = None,
    sources: dict[str, dict] | None = None,
    total: dict | None = None,
) -> JSONResponse:
    body: dict = {"status": status, "data": data, "isLive": is_live}
    if unavailable:
        body["unavailable"] = list(unavailable)
    if sources is not None:
        body["sources"] = sources
    if total is not None:
        body["total"] = total
    return JSONResponse(json_safe(body))


def _unavailable() -> JSONResponse:
    """The whole surface could not get its data. No ``data`` key, no sample."""
    return JSONResponse({"status": "unavailable"}, status_code=UNAVAILABLE_HTTP_STATUS)


POPULATION_CACHE_KEY = "demographics:population"
AGE_CACHE_KEY = "demographics:age"
GROWTH_CACHE_KEY = "demographics:growth"


async def _cached_table(key: str, fetch):
    """One e-Stat table: served from its own cache entry, fetched and cached
    only when it answered. Raises when it did not."""
    value = cache.get(key)
    if value is None:
        value = await fetch()
        cache.set(key, value)
    return value


@router.get("/demographics")
async def get_demographics() -> JSONResponse:
    """Three e-Stat tables of the 令和7年国勢調査 人口等基本集計（確報）, two classes
    of failure (real-data plan PR 2 keeps PR 1's contract).

    The population table and the 不詳補完値 age table are the answer: without
    either there is nothing to show, so 503. The growth table feeds growthRate
    only, so when it fails the answer is partial and names the field. Each
    table is cached on its own, and only when it answered — a partial answer
    therefore reuses the two census tables and asks for the growth table
    again, and a 503 retries only the table that failed.

    ``sources`` names, per census field, the year and the e-Stat table the
    figure came from (dropped for a field listed in ``unavailable``).
    """
    try:
        population = await _cached_table(POPULATION_CACHE_KEY, demographics.fetch_population)
        age_shares = await _cached_table(AGE_CACHE_KEY, demographics.fetch_age_shares)
    except Exception:
        logger.warning("e-Stat census table unavailable — answering 503, not sample", exc_info=True)
        return _unavailable()

    unavailable: list[str] = []
    try:
        growth = await _cached_table(GROWTH_CACHE_KEY, demographics.fetch_growth_rates)
    except Exception:
        logger.warning(
            "e-Stat growth table unavailable — answering partial, growthRate 取得失敗",
            exc_info=True,
        )
        growth = {}
        unavailable = [demographics.GROWTH_FIELD]

    data = demographics.transform_census(population, age_shares, growth)
    return _envelope(
        data,
        is_live=True,
        status="partial" if unavailable else "ok",
        unavailable=unavailable,
        sources=demographics.sources_for(unavailable),
    )


@router.get("/population-trends")
async def get_population_trends() -> JSONResponse:
    """The committed 人口推移 snapshot (real-data plan PR 3): six census totals for
    the 23 wards, 2000–2025, with every ward's row, from memory.

    No upstream and no cache: the file was validated when the app started
    (main.py), so this route cannot fail the way the two live ones can — a
    census-table 503 on /demographics never takes the trend chart down, which
    is why it is a route of its own. ``isLive`` is True: the figures are the
    census's own, not a sample. ``sources`` names, per year, the table.
    """
    snapshot = population_trends.get(settings.POPULATION_TRENDS_PATH)
    return _envelope(
        population_trends.rows(snapshot),
        is_live=True,
        sources=population_trends.sources(snapshot),
    )


@router.get("/land-prices")
async def get_land_prices() -> JSONResponse:
    """The committed 地価公示 snapshot (real-data plan PR 5): per ward, the 住宅地
    and 商業地 mean price over every point and the mean 対前年変動率 over the
    継続 points of 国土数値情報 地価公示データ L01-26 (2026年1月1日時点), each
    figure with its point count, and the 工業地 point count.

    No upstream and no cache: the file was validated when the app started
    (main.py), so this route has no partial or failed answer of its own.
    ``isLive`` is True: the figures are the source's own, not a sample.
    ``sources`` names, per field (price, change), the edition and its year.
    """
    snapshot = land_prices.get(settings.LAND_PRICES_PATH)
    return _envelope(
        land_prices.rows(snapshot),
        is_live=True,
        sources=land_prices.sources(snapshot),
        # Real-data plan PR 8: the 23区 figures over every point, for the
        # comparison table's 23区 column (additive; the records are unchanged).
        total=land_prices.total(snapshot),
    )


@router.get("/zoning")
async def get_zoning() -> JSONResponse:
    """The committed 用途地域 snapshot (real-data plan PR 6): per ward, the share
    of the ward's designated area by 用途地域 type, the designated share of the
    ward, per type the area-weighted 容積率 / 建蔽率 with their range, and the
    時点 from the A55 data list — from 国土数値情報 都市計画決定情報データ A55-24
    clipped to the N03-20260101 ward polygons; the 23区 composition as ``total``.

    No upstream and no cache: the file was validated when the app started
    (main.py), so this route has no partial or failed answer of its own.
    ``isLive`` is True: the figures are the source's own, not a sample.
    ``sources`` names, per field (zoning, wards, asOf), the edition and table.
    """
    snapshot = zoning.get(settings.ZONING_PATH)
    return _envelope(
        zoning.rows(snapshot),
        is_live=True,
        sources=zoning.sources(snapshot),
        total=zoning.total(snapshot),
    )


@router.get("/disaster-risks")
async def get_disaster_risks() -> JSONResponse:
    """The committed 災害 snapshot (real-data plan PR 7): per ward, each hazard
    in its source's own classes — 東京都 地域危険度 第9回 (町丁目 per rank 1–5 for
    総合・建物倒壊・火災, a relative evaluation), 国土数値情報 A31a-25 洪水 and
    A49-20 高潮 (share of the ward's area per 浸水深 class, 想定最大規模), A33-25
    土砂 (警戒区域 / 特別警戒区域 per 現象) and 津波 (対象外 with its basis) — and
    the 23区 record as ``total``. No ``level`` field.

    No upstream and no cache: the file was validated when the app started
    (main.py), so this route has no partial or failed answer of its own.
    ``isLive`` is True: the figures are the sources' own, not a sample.
    ``sources`` names, per hazard, the survey or edition, its year and table.
    The hazard rasters on the map are fetched client-side from the ハザード
    マップポータルサイト and never pass through here.
    """
    snapshot = disaster_risks.get(settings.DISASTER_RISKS_PATH)
    return _envelope(
        disaster_risks.rows(snapshot),
        is_live=True,
        sources=disaster_risks.sources(snapshot),
        total=disaster_risks.total(snapshot),
    )


@router.get("/green-land-use")
async def get_green_land_use() -> JSONResponse:
    """The committed 公園等・農用地・森林・原野 snapshot (real-data plan PR 8,
    Architect decision 6): per ward the share of the 東京都 土地利用現況調査
    令和3年 ward total that is 公園等, 農用地, 森林 or 原野, with each class's
    hectares; the 23区 figure over the 23 ward rows as ``total``.

    No upstream and no cache: the file was validated when the app started.
    ``sources`` names the survey and its year (2021).
    """
    snapshot = green_land_use.get(settings.GREEN_LAND_USE_PATH)
    return _envelope(
        green_land_use.rows(snapshot),
        is_live=True,
        sources=green_land_use.sources(snapshot),
        total=green_land_use.total(snapshot),
    )


@router.get("/transport")
async def get_transport() -> JSONResponse:
    """The committed 駅別乗降客数 snapshot (real-data plan PR 4): every station of
    the 23 wards from 国土数値情報 S12 (2024年度版), its ward decided on the N03
    polygons, with the per-operator figures the 事業者別 panel sums.

    No upstream and no cache: the file was validated when the app started
    (main.py), so this route has no partial or failed answer of its own.
    ``isLive`` is True: the figures are the source's own, not a sample.
    ``sources`` names, per field, the 国土数値情報 edition and its year.
    """
    snapshot = transport.get(settings.STATIONS_PATH)
    return _envelope(
        transport.rows(snapshot),
        is_live=True,
        sources=transport.sources(snapshot),
    )
