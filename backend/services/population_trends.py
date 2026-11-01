"""The 人口推移 snapshot: six census totals for the 23 特別区, 2000–2025 (real-data plan PR 3).

``backend/data/population_trends.json`` is built by ``etl/population_trends.py``
from committed source files (RECON 2026-10-uo-real-data §9 row 3; the fixture
README under tests/fixtures/population_trends/ records the provenance):

* 2000 / 2005 / 2010 / 2015 / 2020 — e-Stat 国勢調査 時系列データ 第6表 東京都
  (statInfId 000001085987), each census as enumerated; for the 23 wards the
  特別区部 row equals the sum of the wards, and the 2020 sheet equals the 2025
  確報's 2020年（組替） per ward.
* 2025 — 令和7年国勢調査 人口等基本集計（確報）男女別人口 (statsDataId 0004065881),
  the same table /demographics reads, so the whole 人口 tab is one vintage
  (Architect decision 2026-11-01).

The route has no upstream, so there is no runtime failure to report — except
the file itself. That is why ``check_at_startup`` runs when the app module is
imported: a missing or malformed snapshot stops the process, Cloud Run refuses
the revision and the deploy fails, and no user request ever answers with it.
"""

from __future__ import annotations

import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

WARD_CODES = [f"131{n:02d}" for n in range(1, 24)]
REQUIRED_KEYS = ("region", "sources", "inputs", "licence", "credit", "points")


class SnapshotError(ValueError):
    """The snapshot file is missing, not JSON, or not the shape the route serves."""


def _count(value: Any, where: str, *, minimum: int = 0) -> int:
    """A population: a non-negative int, never a bool, float, None or NaN."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise SnapshotError(f"{where}: population must be an integer, got {value!r}")
    if value < minimum:
        raise SnapshotError(f"{where}: population {value} < {minimum}")
    return value


def _text(value: Any, where: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SnapshotError(f"{where}: expected non-empty text, got {value!r}")
    return value


def validate(snapshot: Any) -> None:
    """Raise SnapshotError unless ``snapshot`` is a complete, consistent snapshot."""
    if not isinstance(snapshot, dict):
        raise SnapshotError("snapshot is not an object")
    missing = [k for k in REQUIRED_KEYS if k not in snapshot]
    if missing:
        raise SnapshotError(f"snapshot lacks {missing}")
    _text(snapshot["region"], "region")

    points = snapshot["points"]
    if not isinstance(points, list) or len(points) < 2:
        raise SnapshotError("points: expected a list of at least two census years")
    years: list[int] = []
    for i, point in enumerate(points):
        where = f"points[{i}]"
        if not isinstance(point, dict):
            raise SnapshotError(f"{where}: not an object")
        year = point.get("year")
        if isinstance(year, bool) or not isinstance(year, int):
            raise SnapshotError(f"{where}: year must be an integer, got {year!r}")
        if years and year <= years[-1]:
            raise SnapshotError(f"{where}: year {year} is not after {years[-1]}")
        years.append(year)
        _text(point.get("table"), f"{where}.table")
        total = _count(point.get("population"), f"{where}.population", minimum=1)
        wards = point.get("wards")
        if not isinstance(wards, list):
            raise SnapshotError(f"{where}.wards: not a list")
        codes = []
        ward_sum = 0
        for j, ward in enumerate(wards):
            w = f"{where}.wards[{j}]"
            if not isinstance(ward, dict):
                raise SnapshotError(f"{w}: not an object")
            codes.append(_text(ward.get("code"), f"{w}.code"))
            _text(ward.get("name"), f"{w}.name")
            ward_sum += _count(ward.get("population"), f"{w}.population")
        if codes != WARD_CODES:
            raise SnapshotError(f"{where}.wards: expected the 23 特別区 codes in order, got {codes}")
        if ward_sum != total:
            raise SnapshotError(f"{where}: population {total} != sum of wards {ward_sum}")

    sources = snapshot["sources"]
    if not isinstance(sources, dict):
        raise SnapshotError("sources: not an object")
    for point in points:
        key = str(point["year"])
        entry = sources.get(key)
        if not isinstance(entry, dict):
            raise SnapshotError(f"sources[{key}]: missing")
        if entry.get("year") != point["year"]:
            raise SnapshotError(f"sources[{key}].year: {entry.get('year')!r} != {point['year']}")
        if _text(entry.get("table"), f"sources[{key}].table") != point["table"]:
            raise SnapshotError(f"sources[{key}].table: {entry['table']!r} != point table {point['table']!r}")
        _text(entry.get("label"), f"sources[{key}].label")
    extra = sorted(set(sources) - {str(p["year"]) for p in points})
    if extra:
        raise SnapshotError(f"sources: entries for years without a point: {extra}")

    credit = snapshot["credit"]
    if not isinstance(credit, dict):
        raise SnapshotError("credit: not an object")
    _text(credit.get("source"), "credit.source")
    _text(credit.get("edited"), "credit.edited")
    licence = snapshot["licence"]
    if not isinstance(licence, dict):
        raise SnapshotError("licence: not an object")
    _text(licence.get("url"), "licence.url")


def load(path: Path) -> dict:
    """Read and validate the snapshot at ``path``. Raises SnapshotError."""
    try:
        snapshot = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SnapshotError(f"no snapshot at {path}") from exc
    except (OSError, ValueError) as exc:
        raise SnapshotError(f"snapshot at {path} is not readable JSON: {exc}") from exc
    validate(snapshot)
    return snapshot


@lru_cache(maxsize=4)
def _cached(path: str) -> dict:
    return load(Path(path))


def get(path: Path) -> dict:
    """The validated snapshot, read once per path and kept for the process."""
    return _cached(str(path))


def check_at_startup(path: Path) -> None:
    """Load (and cache) the snapshot, or stop the process with a clear reason."""
    try:
        get(path)
    except SnapshotError as exc:
        raise RuntimeError(f"population_trends snapshot unusable — refusing to start: {exc}") from exc


def rows(snapshot: dict) -> list[dict]:
    """The route's ``data``: per year, the 23-ward total under the snapshot's region, then every ward."""
    region = snapshot["region"]
    out: list[dict] = []
    for point in snapshot["points"]:
        out.append({"year": point["year"], "population": point["population"], "region": region})
        out.extend(
            {"year": point["year"], "population": w["population"], "region": w["name"]} for w in point["wards"]
        )
    return out


def sources(snapshot: dict) -> dict[str, dict]:
    """Per point (keyed by year), the year, table and label — the /demographics ``sources`` shape."""
    return deepcopy(snapshot["sources"])
