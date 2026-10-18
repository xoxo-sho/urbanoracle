"""The three data endpoints, ported from the Next route handlers.

All responses share the ``{"data": [...], "isLive": bool}`` envelope the
client already expects. ``isLive`` means "this came from the upstream
source"; a fallback payload always reports False. A live /transport answer
also carries ``fetchedAt``, when the ODPT data was obtained (ODPT developer
guideline 2.2.1 asks for that 取得日時 on screen).

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


def _envelope(data: list[dict], is_live: bool, fetched_at: str | None = None) -> JSONResponse:
    body: dict = {"data": data, "isLive": is_live}
    if fetched_at is not None:
        body["fetchedAt"] = fetched_at
    return JSONResponse(json_safe(body))


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
        return _envelope(cached["data"], True, fetched_at=cached["fetchedAt"])

    try:
        ridership, _year = await odpt.fetch_ridership()
        fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
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

    cache.set("transport", {"data": data, "fetchedAt": fetched_at})
    return _envelope(data, True, fetched_at=fetched_at)
