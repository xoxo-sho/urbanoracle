"""The three data endpoints, ported from the Next route handlers.

Envelope: ``{"status": "ok" | "partial", "data": [...], "isLive": bool}``.
``status`` says whether the request got everything it asked for; ``isLive``
says whether the figures came from the upstream source (the /disaster-risks
payload is still the curated sample set and reports False). A partial answer
adds ``unavailable``: the record fields the upstream did not deliver, so the
client renders those cells as 取得失敗 and keeps データなし for a cell the
upstream genuinely has no figure for. A live /transport answer also carries
``fetchedAt``, when the ODPT data was obtained (ODPT developer guideline 2.2.1
asks for that 取得日時 on screen). A /demographics answer carries ``sources``:
per census field, the year and the e-Stat table the figure came from, so the
screen can say which vintage every figure is (real-data plan PR 2).

A failure is HTTP 503 with the body ``{"status": "unavailable"}`` and nothing
else — never sample values (RECON 2026-10-uo-real-data §7, PR 1). A 200 would
hide an upstream outage from Cloud Run's error metrics. Nothing incomplete is
remembered as complete: each upstream is cached on its own and only when it
answered, so a partial answer reuses the healthy part and retries the failed
upstream on the next request, and a 503 retries everything.

The REINFOLIB (/land-prices) endpoint was removed: its data was fetched but
nothing on screen ever drew it (RECON 2026-10-data-terms §7.1 UO-3).

Every response goes through ``json_safe`` — the last line of defense against
a non-finite float reaching the client as an invalid-JSON ``NaN`` literal.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core import cache
from core.boundary import json_safe
from services import demographics, disaster_risks, odpt, transport

logger = logging.getLogger(__name__)

router = APIRouter()

UNAVAILABLE_HTTP_STATUS = 503


def _envelope(
    data: list[dict],
    *,
    is_live: bool,
    status: str = "ok",
    unavailable: list[str] | None = None,
    fetched_at: str | None = None,
    sources: dict[str, dict] | None = None,
) -> JSONResponse:
    body: dict = {"status": status, "data": data, "isLive": is_live}
    if unavailable:
        body["unavailable"] = list(unavailable)
    if fetched_at is not None:
        body["fetchedAt"] = fetched_at
    if sources is not None:
        body["sources"] = sources
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


@router.get("/disaster-risks")
async def get_disaster_risks() -> JSONResponse:
    # No upstream exists for this panel: the payload is the curated sample
    # set, so isLive is False. The hazard rasters are fetched client-side
    # from GSI and never pass through here.
    return _envelope(disaster_risks.load_disaster_risks(), is_live=False)


@router.get("/transport")
async def get_transport() -> JSONResponse:
    """Stations come from the committed GeoJSON; ridership comes from ODPT.

    The answer is complete (and cached) only when BOTH succeeded. If ODPT
    fails the station list is still correct but no ridership figure exists,
    so the answer is ``partial`` and names ``dailyPassengers`` as the field
    the upstream did not deliver — the client shows 取得失敗 there, not the
    データなし it shows for a station ODPT genuinely does not cover. If the
    station file itself cannot be read there is nothing honest to show: 503.
    """
    cached = cache.get("transport")
    if cached is not None:
        return _envelope(cached["data"], is_live=True, fetched_at=cached["fetchedAt"])

    try:
        ridership, _year = await odpt.fetch_ridership()
        fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    except Exception:
        logger.warning(
            "ODPT ridership unavailable — answering partial, ridership 取得失敗",
            exc_info=True,
        )
        ridership = None

    try:
        data = transport.load_stations(ridership)
    except Exception:
        logger.warning("station GeoJSON unreadable — answering 503, not sample", exc_info=True)
        return _unavailable()

    if ridership is None:
        return _envelope(
            data, is_live=False, status="partial", unavailable=[transport.RIDERSHIP_FIELD]
        )

    cache.set("transport", {"data": data, "fetchedAt": fetched_at})
    return _envelope(data, is_live=True, fetched_at=fetched_at)
