"""Stations and ridership: the committed 国土数値情報 snapshot (real-data plan PR 4).

``backend/data/stations.json`` is built by ``etl/stations.py`` from committed
source files (RECON 2026-10-uo-real-data §9 row 4; the fixture README under
tests/fixtures/stations/ records the provenance):

* 国土数値情報 駅別乗降客数データ S12, 2024年度（令和6年度）版 — one row per
  運営会社 × 路線 × 駅 with the station's own geometry, so place and figure
  come from one dataset; 乗降客数2024 is 2024年度 (verified at ×2 against JR
  East's published 乗車人員 for five stations).
* 国土数値情報 行政区域データ N03, 2026年1月1日時点 — the ward of a station is
  the polygon containing the midpoint of its row (Architect decision 3,
  2026-11-02); the bounding-box table that assigned wards before, and the
  top-50 cut, are gone.

Architect decisions 2026-11-02: S12 is the sole ridership source and the live
ridership upstream has left the code path (decision 3); every credit is the 加工 form with no editor
name (decision 12); the per-operator figures feed the 事業者別 panel, whose
total equals the ward's 日間乗降客 (decision 13).

The route has no upstream, so the only thing that can be wrong is the file
itself — checked when the app module is imported (``check_at_startup``): a
missing or malformed snapshot stops the process, Cloud Run refuses the
revision and the deploy fails; no request ever answers with it.
"""

from __future__ import annotations

import json
import math
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

WARD_CODES = [f"131{n:02d}" for n in range(1, 24)]
REQUIRED_KEYS = ("region", "year", "sources", "inputs", "licence", "credit", "notes", "wards", "stations")
REQUIRED_SOURCES = ("ridership", "stations", "wards")
REQUIRED_CREDITS = ("source", "edited_s12", "edited_n03")
REQUIRED_NOTES = ("definition", "jr_east")
# The 23 wards lie inside this box (the N03 polygons do); a coordinate outside
# it is a swapped lat/lng or a corrupt file, not a station.
LAT_RANGE, LNG_RANGE = (35.45, 35.95), (139.50, 140.00)

# How a line is labelled on screen: the three operators every reader knows by
# a short name, the rest by the name the source uses.
OPERATOR_LABELS = {"東日本旅客鉄道": "JR", "東京地下鉄": "メトロ", "東京都": "都営"}


class SnapshotError(ValueError):
    """The snapshot file is missing, not JSON, or not the shape the route serves."""


def _count(value: Any, where: str) -> int | None:
    """A figure: a non-negative int or None (not published / counted elsewhere); never a bool, float or NaN."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise SnapshotError(f"{where}: passengers must be an integer or null, got {value!r}")
    if value < 0:
        raise SnapshotError(f"{where}: passengers {value} < 0")
    return value


def _text(value: Any, where: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SnapshotError(f"{where}: expected non-empty text, got {value!r}")
    return value


def _coord(value: Any, where: str, lo: float, hi: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise SnapshotError(f"{where}: expected a finite number, got {value!r}")
    if not lo <= value <= hi:
        raise SnapshotError(f"{where}: {value} outside [{lo}, {hi}]")
    return float(value)


def validate(snapshot: Any) -> None:
    """Raise SnapshotError unless ``snapshot`` is a complete, consistent snapshot."""
    if not isinstance(snapshot, dict):
        raise SnapshotError("snapshot is not an object")
    missing = [k for k in REQUIRED_KEYS if k not in snapshot]
    if missing:
        raise SnapshotError(f"snapshot lacks {missing}")
    _text(snapshot["region"], "region")
    year = snapshot["year"]
    if isinstance(year, bool) or not isinstance(year, int):
        raise SnapshotError(f"year must be an integer, got {year!r}")

    sources = snapshot["sources"]
    if not isinstance(sources, dict):
        raise SnapshotError("sources: not an object")
    for key in REQUIRED_SOURCES:
        entry = sources.get(key)
        if not isinstance(entry, dict):
            raise SnapshotError(f"sources[{key}]: missing")
        if isinstance(entry.get("year"), bool) or not isinstance(entry.get("year"), int):
            raise SnapshotError(f"sources[{key}].year: {entry.get('year')!r}")
        _text(entry.get("table"), f"sources[{key}].table")
        _text(entry.get("label"), f"sources[{key}].label")
    if sources["ridership"]["year"] != year:
        raise SnapshotError(f"sources.ridership.year {sources['ridership']['year']} != year {year}")

    stations = snapshot["stations"]
    if not isinstance(stations, list) or not stations:
        raise SnapshotError("stations: expected a non-empty list")
    seen: set[tuple[str, str]] = set()
    per_ward_total: dict[str, int] = {}
    per_ward_count: dict[str, int] = {}
    for i, station in enumerate(stations):
        where = f"stations[{i}]"
        if not isinstance(station, dict):
            raise SnapshotError(f"{where}: not an object")
        code = _text(station.get("code"), f"{where}.code")
        _text(station.get("name"), f"{where}.name")
        ward_code = _text(station.get("wardCode"), f"{where}.wardCode")
        if ward_code not in WARD_CODES:
            raise SnapshotError(f"{where}.wardCode: {ward_code!r} is not a 特別区 code")
        _text(station.get("ward"), f"{where}.ward")
        if (code, ward_code) in seen:
            raise SnapshotError(f"{where}: duplicate station {code} in {ward_code}")
        seen.add((code, ward_code))
        _coord(station.get("lat"), f"{where}.lat", *LAT_RANGE)
        _coord(station.get("lng"), f"{where}.lng", *LNG_RANGE)
        operators = station.get("operators")
        if not isinstance(operators, list) or not operators:
            raise SnapshotError(f"{where}.operators: expected a non-empty list")
        known: list[int] = []
        for j, op in enumerate(operators):
            w = f"{where}.operators[{j}]"
            if not isinstance(op, dict):
                raise SnapshotError(f"{w}: not an object")
            _text(op.get("name"), f"{w}.name")
            lines = op.get("lines")
            if not isinstance(lines, list) or not lines or not all(isinstance(line, str) and line for line in lines):
                raise SnapshotError(f"{w}.lines: expected a non-empty list of names")
            figure = _count(op.get("passengers"), f"{w}.passengers")
            if figure is not None:
                known.append(figure)
        total = _count(station.get("dailyPassengers"), f"{where}.dailyPassengers")
        if total != (sum(known) if known else None):
            raise SnapshotError(f"{where}.dailyPassengers {total!r} != sum of operators {sum(known) if known else None!r}")
        if "note" in station:
            _text(station["note"], f"{where}.note")
        per_ward_total[ward_code] = per_ward_total.get(ward_code, 0) + (total or 0)
        per_ward_count[ward_code] = per_ward_count.get(ward_code, 0) + 1

    missing_wards = [c for c in WARD_CODES if c not in per_ward_count]
    if missing_wards:
        raise SnapshotError(f"wards without a station: {missing_wards}")
    wards = snapshot["wards"]
    if not isinstance(wards, list) or [w.get("code") for w in wards if isinstance(w, dict)] != WARD_CODES:
        raise SnapshotError("wards: expected the 23 特別区 in code order")
    for w in wards:
        code = w["code"]
        if w.get("stations") != per_ward_count[code] or w.get("passengers") != per_ward_total[code]:
            raise SnapshotError(
                f"wards[{code}]: {w.get('stations')} stations / {w.get('passengers')} passengers, "
                f"stations list says {per_ward_count[code]} / {per_ward_total[code]}"
            )

    credit = snapshot["credit"]
    if not isinstance(credit, dict):
        raise SnapshotError("credit: not an object")
    for key in REQUIRED_CREDITS:
        _text(credit.get(key), f"credit.{key}")
    for key in ("edited_s12", "edited_n03"):
        if not credit[key].endswith("を加工して作成") or "をもとに" in credit[key]:
            raise SnapshotError(f"credit.{key}: not the 加工 form without an editor name")
    notes = snapshot["notes"]
    if not isinstance(notes, dict):
        raise SnapshotError("notes: not an object")
    for key in REQUIRED_NOTES:
        _text(notes.get(key), f"notes.{key}")
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
        raise RuntimeError(f"stations snapshot unusable — refusing to start: {exc}") from exc


def line_label(operator: str, line: str) -> str:
    """「JR 山手線」, 「メトロ 4号線丸ノ内線」, 「都営 10号線新宿線」, 「ゆりかもめ 東京臨海新交通臨海線」."""
    return f"{OPERATOR_LABELS.get(operator, operator)} {line}"


def rows(snapshot: dict) -> list[dict]:
    """The route's ``data``: one record per station, in the client's shape."""
    out: list[dict] = []
    for s in snapshot["stations"]:
        name = s["name"] if s["name"].endswith("駅") else f"{s['name']}駅"
        record = {
            "id": f"s12-{s['code']}-{s['wardCode']}",
            "code": s["code"],
            "name": name,
            "lat": s["lat"],
            "lng": s["lng"],
            "type": "train",
            "dailyPassengers": s["dailyPassengers"],
            "lines": [line_label(o["name"], line) for o in s["operators"] for line in o["lines"]],
            "ward": s["ward"],
            "wardCode": s["wardCode"],
            "operators": [{"name": o["name"], "lines": list(o["lines"]), "passengers": o["passengers"]} for o in s["operators"]],
        }
        if s.get("note"):
            record["note"] = s["note"]
        out.append(record)
    return out


def sources(snapshot: dict) -> dict[str, dict]:
    """Per field (ridership, stations, wards): the year, table and label — the /demographics ``sources`` shape."""
    return deepcopy(snapshot["sources"])
