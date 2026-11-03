"""用途地域: the committed 国土数値情報 A55 snapshot (real-data plan PR 6).

``backend/data/zoning.json`` is built by ``etl/zoning.py`` from the committed
excerpts under tests/fixtures/zoning/ (RECON 2026-10-uo-real-data §9 row 6;
the fixture README records the provenance): 国土数値情報 都市計画決定情報データ
A55-24, 2024年度（令和6年度）版, the 23 wards' 用途地域 layers of the 東京都
archive, clipped to the N03-20260101 ward polygons PR 4 committed.

Architect decisions (2026-11-03): per ward, the share of the ward's
用途地域-designated area by type (the shares sum to 100), the designated share
of the ward — area(designated ∩ N03 ward polygon) ÷ area(N03 ward polygon),
never above 100 — per type present the area-weighted mean 指定容積率 / 指定建蔽率
with their min–max, and the 時点 read from the A55 data list's データ時点年
column (way 1: a ward the list does not date says so, no inferred date); the
23区 composition is the area-weighted sum over the wards. Types keep A55's
codes and names. Every KSJ credit is the 加工 form with no editor name
(decision 12), and the A55 page's 【重要：データ利用時の注意事項】 ride with the
figures.

The route has no upstream, so the only thing that can be wrong is the file
itself — checked when the app module is imported (``check_at_startup``): a
missing or malformed snapshot stops the process, Cloud Run refuses the
revision and the deploy fails; no request ever answers with it.
"""

from __future__ import annotations

import json
import math
import re
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

WARD_CODES = [f"131{n:02d}" for n in range(1, 24)]
TOTAL_CODE = "13100"
REQUIRED_KEYS = ("region", "year", "edition", "sources", "inputs", "licence", "credit", "notices", "notes", "types", "total", "wards")
REQUIRED_SOURCES = ("zoning", "wards", "asOf")
REQUIRED_CREDITS = ("source", "edited_a55", "edited_n03")
REQUIRED_NOTES = ("share", "designated", "far", "asOf", "types", "area")
TYPE_CODES = range(1, 14)
NOTICE_COUNT = 6
# The data-list bullet of the A55 注意事項: the one that names where the 時点 comes from.
ASOF_NOTICE_PREFIX = "本データは、最新の情報ではないことがあります。"
ASOF_MISSING_TEXT = "時点：国土数値情報の掲載データ一覧に記載なし"
SHARE_TOLERANCE = 0.5
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class SnapshotError(ValueError):
    """The snapshot file is missing, not JSON, or not the shape the route serves."""


def _int(value: Any, where: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise SnapshotError(f"{where}: expected an integer, got {value!r}")
    if value < minimum:
        raise SnapshotError(f"{where}: {value} < {minimum}")
    return value


def _number(value: Any, where: str, *, minimum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise SnapshotError(f"{where}: expected a finite number, got {value!r}")
    if minimum is not None and value < minimum:
        raise SnapshotError(f"{where}: {value} < {minimum}")
    return float(value)


def _text(value: Any, where: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SnapshotError(f"{where}: expected non-empty text, got {value!r}")
    return value


def _range(value: Any, where: str) -> dict:
    """An attribute's area-weighted mean inside its min–max, all positive."""
    if not isinstance(value, dict):
        raise SnapshotError(f"{where}: not an object")
    mean = _number(value.get("mean"), f"{where}.mean", minimum=0)
    lo = _number(value.get("min"), f"{where}.min", minimum=0)
    hi = _number(value.get("max"), f"{where}.max", minimum=0)
    if not lo <= mean <= hi:
        raise SnapshotError(f"{where}: mean {mean} outside [{lo}, {hi}]")
    if mean <= 0:
        raise SnapshotError(f"{where}: mean {mean} is not above zero")
    return value


def _composition(value: Any, where: str, names: dict[int, str]) -> dict:
    if not isinstance(value, dict):
        raise SnapshotError(f"{where}: not an object")
    for key in ("code", "name", "wardM2", "designatedM2", "designatedShare", "polygons", "asOf", "types"):
        if key not in value:
            raise SnapshotError(f"{where}: lacks {key}")
    _text(value["name"], f"{where}.name")
    ward_m2 = _number(value["wardM2"], f"{where}.wardM2", minimum=1)
    designated = _number(value["designatedM2"], f"{where}.designatedM2", minimum=1)
    share = _number(value["designatedShare"], f"{where}.designatedShare", minimum=0)
    if designated > ward_m2 * (1 + 1e-9):
        raise SnapshotError(f"{where}: designatedM2 {designated} exceeds wardM2 {ward_m2}")
    if share > 100:
        raise SnapshotError(f"{where}: designatedShare {share} > 100")
    if abs(share - round(designated / ward_m2 * 100, 2)) > 0.011:
        raise SnapshotError(f"{where}: designatedShare {share} != designatedM2 / wardM2")
    _int(value["polygons"], f"{where}.polygons", minimum=1)

    as_of = value["asOf"]
    if not isinstance(as_of, dict) or "date" not in as_of:
        raise SnapshotError(f"{where}.asOf: not an object with a date")
    _text(as_of.get("label"), f"{where}.asOf.label")
    text = _text(as_of.get("text"), f"{where}.asOf.text")
    if as_of["date"] is None:
        if value["code"] != TOTAL_CODE and text != ASOF_MISSING_TEXT:
            raise SnapshotError(f"{where}.asOf: no date but the text claims one: {text!r}")
        if value["code"] == TOTAL_CODE and not (ISO_DATE.match(str(as_of.get("from"))) and ISO_DATE.match(str(as_of.get("to")))):
            raise SnapshotError(f"{where}.asOf: the 23区 range needs from/to dates")
    else:
        if not isinstance(as_of["date"], str) or not ISO_DATE.match(as_of["date"]):
            raise SnapshotError(f"{where}.asOf.date: {as_of['date']!r} is not an ISO date")
        if text == ASOF_MISSING_TEXT:
            raise SnapshotError(f"{where}.asOf: a date with the 記載なし text")

    types = value["types"]
    if not isinstance(types, list) or not types:
        raise SnapshotError(f"{where}.types: empty")
    codes = []
    total_share = 0.0
    total_m2 = 0.0
    for i, t in enumerate(types):
        tw = f"{where}.types[{i}]"
        if not isinstance(t, dict):
            raise SnapshotError(f"{tw}: not an object")
        code = _int(t.get("code"), f"{tw}.code", minimum=1)
        if code not in TYPE_CODES:
            raise SnapshotError(f"{tw}.code: {code} is not one of 1–13")
        if t.get("name") != names.get(code):
            raise SnapshotError(f"{tw}.name: {t.get('name')!r} is not the codelist's {names.get(code)!r}")
        codes.append(code)
        total_m2 += _number(t.get("m2"), f"{tw}.m2", minimum=0)
        total_share += _number(t.get("share"), f"{tw}.share", minimum=0)
        _int(t.get("n"), f"{tw}.n", minimum=1)
        _range(t.get("far"), f"{tw}.far")
        _range(t.get("bcr"), f"{tw}.bcr")
    if codes != sorted(codes) or len(set(codes)) != len(codes):
        raise SnapshotError(f"{where}.types: not in A55 code order without repeats: {codes}")
    if abs(total_share - 100) > SHARE_TOLERANCE:
        raise SnapshotError(f"{where}.types: shares sum to {total_share}, not 100 ± {SHARE_TOLERANCE}")
    if abs(total_m2 - designated) > 0.01 * max(1.0, designated / 1e6):
        raise SnapshotError(f"{where}.types: areas sum to {total_m2}, designatedM2 is {designated}")
    return value


def validate(snapshot: Any) -> None:
    """Raise SnapshotError unless ``snapshot`` is a complete, consistent snapshot."""
    if not isinstance(snapshot, dict):
        raise SnapshotError("snapshot is not an object")
    missing = [k for k in REQUIRED_KEYS if k not in snapshot]
    if missing:
        raise SnapshotError(f"snapshot lacks {missing}")
    _text(snapshot["region"], "region")
    year = _int(snapshot["year"], "year", minimum=1970)
    _text(snapshot["edition"], "edition")

    sources = snapshot["sources"]
    if not isinstance(sources, dict):
        raise SnapshotError("sources: not an object")
    for key in REQUIRED_SOURCES:
        entry = sources.get(key)
        if not isinstance(entry, dict):
            raise SnapshotError(f"sources[{key}]: missing")
        _int(entry.get("year"), f"sources[{key}].year", minimum=1970)
        _text(entry.get("table"), f"sources[{key}].table")
        _text(entry.get("label"), f"sources[{key}].label")
    if sources["zoning"]["year"] != year:
        raise SnapshotError(f"sources[zoning].year {sources['zoning']['year']} != year {year}")

    types = snapshot["types"]
    if not isinstance(types, list) or [t.get("code") if isinstance(t, dict) else None for t in types] != list(TYPE_CODES):
        raise SnapshotError("types: expected the 13 A55 codes in order")
    names = {t["code"]: _text(t.get("name"), f"types[{t['code']}].name") for t in types}

    wards = snapshot["wards"]
    if not isinstance(wards, list):
        raise SnapshotError("wards: not a list")
    codes = [w.get("code") if isinstance(w, dict) else None for w in wards]
    if codes != WARD_CODES:
        raise SnapshotError(f"wards: expected the 23 特別区 codes in order, got {codes}")
    designated_total = 0.0
    ward_total = 0.0
    polygons_total = 0
    for w in wards:
        _composition(w, f"wards[{w['code']}]", names)
        designated_total += w["designatedM2"]
        ward_total += w["wardM2"]
        polygons_total += w["polygons"]

    total = _composition(snapshot["total"], "total", names)
    if total["code"] != TOTAL_CODE:
        raise SnapshotError(f"total.code: {total['code']!r} is not {TOTAL_CODE}")
    if abs(total["designatedM2"] - designated_total) > 0.1 or abs(total["wardM2"] - ward_total) > 0.1:
        raise SnapshotError("total: not the sum of the wards' areas")
    if total["polygons"] != polygons_total:
        raise SnapshotError(f"total.polygons {total['polygons']} != sum of wards {polygons_total}")

    credit = snapshot["credit"]
    if not isinstance(credit, dict):
        raise SnapshotError("credit: not an object")
    for key in REQUIRED_CREDITS:
        _text(credit.get(key), f"credit.{key}")
    for key in ("edited_a55", "edited_n03"):
        if not credit[key].endswith("を加工して作成") or "をもとに" in credit[key]:
            raise SnapshotError(f"credit.{key}: not the 加工 form without an editor name")
    notices = snapshot["notices"]
    if not isinstance(notices, list) or len(notices) != NOTICE_COUNT:
        raise SnapshotError(f"notices: expected the {NOTICE_COUNT} A55 注意事項")
    for i, n in enumerate(notices):
        _text(n, f"notices[{i}]")
    if not any(n.startswith(ASOF_NOTICE_PREFIX) for n in notices):
        raise SnapshotError("notices: the 時点 bullet (注意事項 4) is missing")
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
        raise RuntimeError(f"zoning snapshot unusable — refusing to start: {exc}") from exc


def _record(composition: dict) -> dict:
    """One composition in the client's shape: ``name`` becomes ``region``; the
    data-list cells stay in the snapshot."""
    as_of = {k: v for k, v in composition["asOf"].items() if k != "cells"}
    return {
        "region": composition["name"],
        "code": composition["code"],
        "wardM2": composition["wardM2"],
        "designatedM2": composition["designatedM2"],
        "designatedShare": composition["designatedShare"],
        "outsideM2": composition["outsideM2"],
        "polygons": composition["polygons"],
        "asOf": deepcopy(as_of),
        "types": deepcopy(composition["types"]),
    }


def rows(snapshot: dict) -> list[dict]:
    """The route's ``data``: one record per ward, in code order."""
    return [_record(w) for w in snapshot["wards"]]


def total(snapshot: dict) -> dict:
    """The 23区 composition, in the client's shape."""
    return _record(snapshot["total"])


def sources(snapshot: dict) -> dict[str, dict]:
    """Per field (zoning, wards, asOf): the year, table and label — the /demographics ``sources`` shape."""
    return deepcopy(snapshot["sources"])
