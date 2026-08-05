"""The REINFOLIB request contract.

XIT001 keys `area` on the 2-digit prefecture and `city` on the municipality.
Sending the 5-digit ward code as `area` returns HTTP 400 for every ward, which
the router absorbs into a sample fallback — so the dashboard showed fabricated
prices and nothing anywhere reported an error. This pins the contract.
"""

import asyncio

import httpx
import pytest

from services.land_prices import PREFECTURE, TARGET_WARDS, _fetch_ward

RECORD = {
    "Municipality": "千代田区",
    "DistrictName": "丸の内",
    "TradePrice": "100000000",
    "Area": "100",
    "CityPlanning": "商業地域",
    "Use": "事務所",
}


def _capture():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["params"] = dict(request.url.params)
        # Mimic REINFOLIB: 400 unless area is the 2-digit prefecture.
        if seen["params"].get("area") != PREFECTURE:
            return httpx.Response(400, json={"area": "'area'が不正な形式です。"})
        return httpx.Response(200, json={"status": "OK", "data": [RECORD]})

    return seen, httpx.MockTransport(handler)


def test_sends_prefecture_as_area_and_ward_as_city():
    seen, transport = _capture()

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await _fetch_ward(client, "13101", "dummy-key")

    points = asyncio.run(run())
    assert seen["params"]["area"] == "13"
    assert seen["params"]["city"] == "13101"
    assert len(points) == 1
    assert points[0]["price"] == 1_000_000


def test_the_old_parameter_shape_would_have_returned_nothing():
    """Fault injection: the pre-fix call shape yields an empty ward, i.e. fallback."""
    _seen, transport = _capture()

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            # The old code sent the ward code as `area` and no `city`.
            response = await client.get(
                "https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001",
                params={"area": "13101", "year": 2024},
            )
            return response

    resp = asyncio.run(run())
    assert resp.status_code == 400


def test_every_target_ward_is_in_the_same_prefecture():
    """The split is uniform, so one constant prefecture is correct."""
    assert all(code.startswith(PREFECTURE) for code in TARGET_WARDS)
    assert len(TARGET_WARDS) == 8
