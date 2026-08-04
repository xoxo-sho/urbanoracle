"""Transport stations, read from the committed GeoJSON on disk.

The Next route fetched this file over HTTP from its own origin
(``https://${VERCEL_URL}/data/tokyo-stations.geojson``), which needed a live
public origin just to read a file that ships inside the deployment. Here it
is a local file read: no network, no origin guessing, and it works
identically in a container, in CI and on a laptop.

The bbox ward assignment and the operator-name rewrites are ports of the
original pure logic.
"""

import json
import logging
from pathlib import Path

from core.config import settings
from services import sample_data

logger = logging.getLogger(__name__)

STATIONS_FILENAME = "tokyo-stations.geojson"
MAX_STATIONS = 50

# name, lat_min, lat_max, lng_min, lng_max
WARD_BOUNDS: tuple[tuple[str, float, float, float, float], ...] = (
    ("千代田区", 35.672, 35.705, 139.730, 139.781),
    ("中央区", 35.650, 35.688, 139.756, 139.792),
    ("港区", 35.630, 35.678, 139.720, 139.770),
    ("新宿区", 35.681, 35.716, 139.683, 139.729),
    ("文京区", 35.700, 35.728, 139.731, 139.768),
    ("台東区", 35.700, 35.731, 139.765, 139.796),
    ("墨田区", 35.692, 35.735, 139.788, 139.822),
    ("江東区", 35.630, 35.705, 139.780, 139.852),
    ("品川区", 35.585, 35.635, 139.705, 139.755),
    ("目黒区", 35.620, 35.662, 139.675, 139.715),
    ("大田区", 35.520, 35.595, 139.670, 139.755),
    ("世田谷区", 35.610, 35.670, 139.598, 139.686),
    ("渋谷区", 35.650, 35.683, 139.682, 139.720),
    ("中野区", 35.695, 35.723, 139.645, 139.687),
    ("杉並区", 35.680, 35.720, 139.598, 139.668),
    ("豊島区", 35.713, 35.743, 139.698, 139.738),
    ("北区", 35.735, 35.785, 139.705, 139.765),
    ("荒川区", 35.722, 35.753, 139.763, 139.805),
    ("板橋区", 35.730, 35.785, 139.640, 139.720),
    ("練馬区", 35.715, 35.765, 139.595, 139.695),
    ("足立区", 35.745, 35.810, 139.755, 139.853),
    ("葛飾区", 35.720, 35.775, 139.820, 139.885),
    ("江戸川区", 35.650, 35.745, 139.835, 139.910),
)

OPERATOR_REWRITES = (
    ("東日本旅客鉄道", "JR"),
    ("東京地下鉄", "メトロ"),
    ("東京都", "都営"),
)


def assign_ward(lat: float, lng: float) -> str | None:
    for name, lat_min, lat_max, lng_min, lng_max in WARD_BOUNDS:
        if lat_min <= lat <= lat_max and lng_min <= lng <= lng_max:
            return name
    return None


def _rewrite_line(line: str) -> str:
    for old, new in OPERATOR_REWRITES:
        line = line.replace(old, new)
    return line


def transform_stations(geojson: dict) -> list[dict]:
    """Pure: station GeoJSON → the top MAX_STATIONS by line count."""
    features = sorted(
        geojson.get("features", []),
        key=lambda f: f.get("properties", {}).get("lineCount", 0),
        reverse=True,
    )[:MAX_STATIONS]

    stations: list[dict] = []
    for index, feature in enumerate(features):
        props = feature.get("properties", {})
        lng, lat = feature["geometry"]["coordinates"]
        stations.append(
            {
                "id": f"ts-{index}",
                "name": f"{props.get('name', '')}駅",
                "lat": lat,
                "lng": lng,
                "type": "train",
                # The source GeoJSON carries no ridership figures.
                "dailyPassengers": 0,
                "lines": [_rewrite_line(line) for line in props.get("lines", [])],
                "ward": assign_ward(lat, lng),
            }
        )
    return stations


def stations_path() -> Path:
    return settings.DATA_DIR / STATIONS_FILENAME


def load_stations() -> list[dict]:
    """Read and transform the committed GeoJSON. Raises if it is missing."""
    path = stations_path()
    with path.open(encoding="utf-8") as fh:
        geojson = json.load(fh)
    stations = transform_stations(geojson)
    if not stations:
        raise RuntimeError(f"{path} yielded no stations")
    return stations


def fallback() -> list[dict]:
    return sample_data.transport_stations()
