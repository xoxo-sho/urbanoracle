"""The four data endpoints, ported from the Next route handlers.

All responses share the ``{"data": [...], "isLive": bool}`` envelope the
client already expects. ``isLive`` means "this came from the upstream
source"; a fallback payload always reports False.

Every response goes through ``json_safe`` — the last line of defense against
a non-finite float reaching the client as an invalid-JSON ``NaN`` literal.
"""

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core import cache
from core.boundary import json_safe
from services import demographics, disaster_risks, land_prices, odpt, transport

logger = logging.getLogger(__name__)

router = APIRouter()


def _envelope(data: list[dict], is_live: bool) -> JSONResponse:
    return JSONResponse(json_safe({"data": data, "isLive": is_live}))


@router.get("/land-prices")
async def get_land_prices() -> JSONResponse:
    cached = cache.get("land-prices")
    if cached is not None:
        return _envelope(cached, True)
    try:
        data = await land_prices.fetch_land_prices()
    except Exception:
        logger.warning("land price upstream unavailable — serving fallback", exc_info=True)
        return _envelope(land_prices.fallback(), False)
    cache.set("land-prices", data)
    return _envelope(data, True)


@router.get("/demographics")
async def get_demographics() -> JSONResponse:
    cached = cache.get("demographics")
    if cached is not None:
        return _envelope(cached, True)
    try:
        data = await demographics.fetch_demographics()
    except Exception:
        logger.warning("e-Stat upstream unavailable — serving fallback", exc_info=True)
        return _envelope(demographics.fallback(), False)
    cache.set("demographics", data)
    return _envelope(data, True)


@router.get("/disaster-risks")
async def get_disaster_risks() -> JSONResponse:
    # No upstream exists for this panel: the payload is the curated sample
    # set, so isLive is False. The hazard rasters are fetched client-side
    # from GSI and never pass through here.
    return _envelope(disaster_risks.load_disaster_risks(), False)


@router.get("/transport")
async def get_transport() -> JSONResponse:
    """Stations come from the committed GeoJSON; ridership comes from ODPT.

    isLive is true only when BOTH succeeded. If ODPT fails the station list is
    still correct, but every ridership figure would be null — reporting that
    as live data would present "unknown" as though it were measured, so the
    whole response is marked isLive=false and the failure is logged loudly.
    """
    cached = cache.get("transport")
    if cached is not None:
        return _envelope(cached, True)

    try:
        ridership, _year = await odpt.fetch_ridership()
    except Exception:
        logger.warning(
            "ODPT ridership unavailable — station ridership will be データなし",
            exc_info=True,
        )
        ridership = None

    try:
        data = transport.load_stations(ridership)
    except Exception:
        logger.warning("station GeoJSON unreadable — serving fallback", exc_info=True)
        return _envelope(transport.fallback(), False)

    if ridership is None:
        # Stations are real, ridership is not available: do not claim live.
        return _envelope(data, False)

    cache.set("transport", data)
    return _envelope(data, True)
