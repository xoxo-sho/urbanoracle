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

Real-data plan PR 4b (Architect decisions 2026-11-09): the snapshot also
carries 乗降客数推移 — a fixed panel of units summed per ward and for the 23
wards over 2018 and 2020–2024, 2019 a gap with its reason (``trend``; the
panel itself, with the reason class of every excluded unit, is the builder's
committed input ``ridership_panel.json``) — each figure row's 備考 of the year
as S12 writes it (``remarks``), where S12 counts a station every row of
which says 他路線駅に記載 (``countedElsewhere`` and its ``note``), and S12's own
notice on what the operators' figures are (``notes.source_notice``). The
route sends the trend beside ``data`` as ``total``.

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
REQUIRED_KEYS = ("region", "year", "sources", "inputs", "licence", "credit", "notes", "wards", "trend", "stations")
REQUIRED_SOURCES = ("ridership", "stations", "wards", "trend")
REQUIRED_CREDITS = ("source", "edited_s12", "edited_n03")
REQUIRED_NOTES = ("definition", "jr_east", "source_notice", "source_notice_at")
TOTAL_CODE = "13100"
# What the 駅一覧 cell of a station counted on another row reads: with the row
# S12 names, or without one.
COUNTED_LABELS = ("他の行に計上", "他の行に計上（国土数値情報に記載先の明示なし）")
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
        if "remarks" in station:
            remarks = station["remarks"]
            if not isinstance(remarks, list) or not remarks:
                raise SnapshotError(f"{where}.remarks: expected a non-empty list")
            for j, remark in enumerate(remarks):
                if not isinstance(remark, dict):
                    raise SnapshotError(f"{where}.remarks[{j}]: not an object")
                for key in ("operator", "line", "text"):
                    _text(remark.get(key), f"{where}.remarks[{j}].{key}")
        elsewhere = station.get("countedElsewhere")
        if elsewhere is not None:
            # Only a station without a figure is counted elsewhere; the note
            # is the sentence naming where, present exactly when S12 names a row.
            if total is not None or not isinstance(elsewhere, dict):
                raise SnapshotError(f"{where}.countedElsewhere: on a station with a figure, or not an object")
            targets = elsewhere.get("targets")
            if elsewhere.get("label") not in COUNTED_LABELS or not isinstance(targets, list):
                raise SnapshotError(f"{where}.countedElsewhere: label {elsewhere.get('label')!r}")
            if (elsewhere["label"] == COUNTED_LABELS[0]) != bool(targets) or bool(targets) != ("note" in station):
                raise SnapshotError(f"{where}.countedElsewhere: label, targets and note disagree")
            for j, target in enumerate(targets):
                if not isinstance(target, dict):
                    raise SnapshotError(f"{where}.countedElsewhere.targets[{j}]: not an object")
                for key in ("ward", "wardCode", "station", "operator", "line", "remark"):
                    _text(target.get(key), f"{where}.countedElsewhere.targets[{j}].{key}")
        elif "note" in station:
            raise SnapshotError(f"{where}.note: a note without the row it explains (countedElsewhere)")
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

    _validate_trend(snapshot["trend"], year, wards, per_ward_total)

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


def _int(value: Any, where: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise SnapshotError(f"{where}: expected a non-negative integer, got {value!r}")
    return value


def _validate_trend(trend: Any, year: int, wards: list[dict], per_ward_total: dict[str, int]) -> None:
    """乗降客数推移: one view for 東京23区 and one per ward, each a series over the
    same years ending in the snapshot's year; the 23区 view is the sum of the
    wards; a view's 日間乗降客 is its ward's; the panel never exceeds the whole;
    every year left out between the first and the last has its stated reason."""
    if not isinstance(trend, dict):
        raise SnapshotError("trend: not an object")
    panel = trend.get("panel")
    if not isinstance(panel, dict):
        raise SnapshotError("trend.panel: not an object")
    _text(panel.get("id"), "trend.panel.id")
    years = trend.get("years")
    if not isinstance(years, list) or len(years) < 2 or any(isinstance(y, bool) or not isinstance(y, int) for y in years):
        raise SnapshotError(f"trend.years: {years!r}")
    if years != sorted(set(years)) or years[-1] != year:
        raise SnapshotError(f"trend.years: {years} must ascend and end in {year}")
    gaps = trend.get("gaps")
    if not isinstance(gaps, list):
        raise SnapshotError("trend.gaps: not a list")
    gap_years = []
    for i, gap in enumerate(gaps):
        if not isinstance(gap, dict):
            raise SnapshotError(f"trend.gaps[{i}]: not an object")
        gap_years.append(_int(gap.get("year"), f"trend.gaps[{i}].year"))
        _text(gap.get("text"), f"trend.gaps[{i}].text")
    missing = [y for y in range(years[0], years[-1] + 1) if y not in years]
    if sorted(gap_years) != missing:
        raise SnapshotError(f"trend.gaps: years {sorted(gap_years)}, the series leaves out {missing}")

    views = trend.get("views")
    expected = [(TOTAL_CODE, None)] + [(w["code"], w["name"]) for w in wards]
    if not isinstance(views, list) or [v.get("code") for v in views if isinstance(v, dict)] != [code for code, _ in expected]:
        raise SnapshotError("trend.views: expected 東京23区 and then the 23 特別区 in code order")
    for (code, name), view in zip(expected, views):
        where = f"trend.views[{code}]"
        _text(view.get("name"), f"{where}.name")
        if name is not None and view["name"] != name:
            raise SnapshotError(f"{where}.name: {view['name']!r}, the ward is {name!r}")
        units, inside = _int(view.get("units"), f"{where}.units"), _int(view.get("panelUnits"), f"{where}.panelUnits")
        if inside > units:
            raise SnapshotError(f"{where}: {inside} panel units of {units}")
        passengers = _int(view.get("passengers"), f"{where}.passengers")
        want = sum(per_ward_total.values()) if name is None else per_ward_total[code]
        if passengers != want:
            raise SnapshotError(f"{where}.passengers {passengers}, the stations sum to {want}")
        series = view.get("series")
        if not isinstance(series, list) or [p.get("year") for p in series if isinstance(p, dict)] != years:
            raise SnapshotError(f"{where}.series: expected one point per year of {years}")
        for point in series:
            _int(point.get("passengers"), f"{where}.series[{point['year']}].passengers")
        if _int(view.get("panelPassengers"), f"{where}.panelPassengers") != series[-1]["passengers"] or series[-1]["passengers"] > passengers:
            raise SnapshotError(f"{where}: the panel's {year} sum must be the series' last point and no more than 日間乗降客")
        if (inside == units) != (series[-1]["passengers"] == passengers):
            raise SnapshotError(f"{where}: all units in the panel must mean the whole of 日間乗降客, and only then")
    total, ward_views = views[0], views[1:]
    for key in ("units", "panelUnits"):
        if total[key] != sum(v[key] for v in ward_views):
            raise SnapshotError(f"trend.views[{TOTAL_CODE}].{key} is not the sum of the wards")
    for i, point in enumerate(total["series"]):
        if point["passengers"] != sum(v["series"][i]["passengers"] for v in ward_views):
            raise SnapshotError(f"trend.views[{TOTAL_CODE}].series[{point['year']}] is not the sum of the wards")
    if (panel.get("units"), panel.get("unitsIn")) != (total["units"], total["panelUnits"]):
        raise SnapshotError("trend.panel: its counts are not the 23区 view's")


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
        if s.get("remarks"):
            record["remarks"] = deepcopy(s["remarks"])
        if s.get("countedElsewhere"):
            record["countedElsewhere"] = deepcopy(s["countedElsewhere"])
        if s.get("note"):
            record["note"] = s["note"]
        out.append(record)
    return out


def total(snapshot: dict) -> dict:
    """What the route sends beside ``data``: the 23区 record carrying 乗降客数推移 —
    the panel's id, its years, each gap with its reason, and one view per
    region (東京23区 first, then the wards in code order)."""
    trend = snapshot["trend"]
    return {
        "code": TOTAL_CODE,
        "name": snapshot["region"],
        "trend": {
            "panel": trend["panel"]["id"],
            "years": list(trend["years"]),
            "gaps": [{"year": g["year"], "text": g["text"]} for g in trend["gaps"]],
            "views": deepcopy(trend["views"]),
        },
    }


def sources(snapshot: dict) -> dict[str, dict]:
    """Per field (ridership, stations, wards, trend): the year, table and label — the /demographics ``sources`` shape."""
    return deepcopy(snapshot["sources"])
