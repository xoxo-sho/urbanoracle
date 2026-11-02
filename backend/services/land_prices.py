"""地価公示: the committed 国土数値情報 L01 snapshot (real-data plan PR 5).

``backend/data/land_prices.json`` is built by ``etl/land_prices.py`` from the
committed excerpt under tests/fixtures/land_prices/ (RECON 2026-10-uo-real-data
§9 row 5; the fixture README records the provenance): 国土数値情報 地価公示データ
L01-26, 2026年（令和8年）版, the 東京都 extract, 2026年1月1日時点 — the 1,567
標準地 of the 23 wards.

Architect decision 4 (2026-11-02): L01 only (都道府県地価調査 L02 is not used);
per ward and per use — 住宅地 (用途区分 000) and 商業地 (005) — the price is the
simple mean of the 地価公示価格 over every point of that use and the change is
the simple mean of the 対前年変動率 over the 継続 points, the definitions behind
the 東京都財務局's 区市町村別用途別 tables; 工業地 gets its point count only;
every figure carries its n. Every KSJ credit is the 加工 form with no editor
name (decision 12).

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
REQUIRED_KEYS = ("region", "year", "referenceDate", "sources", "inputs", "licence", "credit", "notes", "uses", "total", "wards")
REQUIRED_SOURCES = ("price", "change")
REQUIRED_CREDITS = ("source", "edited_l01")
REQUIRED_NOTES = ("price", "change")
USES = ("residential", "commercial")
FIGURE_KEYS = ("n", "meanPrice", "minPrice", "maxPrice", "nContinuing", "meanChange")


class SnapshotError(ValueError):
    """The snapshot file is missing, not JSON, or not the shape the route serves."""


def _int(value: Any, where: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise SnapshotError(f"{where}: expected an integer, got {value!r}")
    if value < minimum:
        raise SnapshotError(f"{where}: {value} < {minimum}")
    return value


def _number(value: Any, where: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise SnapshotError(f"{where}: expected a finite number, got {value!r}")
    return float(value)


def _text(value: Any, where: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SnapshotError(f"{where}: expected non-empty text, got {value!r}")
    return value


def _figures(value: Any, where: str, *, minimum_points: int) -> dict:
    """One use's figures: n points (≥ minimum_points), a mean price with its
    min and max, and the mean change over the n continuing points — None
    exactly when no point continues from the previous year."""
    if not isinstance(value, dict):
        raise SnapshotError(f"{where}: not an object")
    missing = [k for k in FIGURE_KEYS if k not in value]
    if missing:
        raise SnapshotError(f"{where}: lacks {missing}")
    n = _int(value["n"], f"{where}.n", minimum=minimum_points)
    mean = _int(value["meanPrice"], f"{where}.meanPrice", minimum=1)
    lo = _int(value["minPrice"], f"{where}.minPrice", minimum=1)
    hi = _int(value["maxPrice"], f"{where}.maxPrice", minimum=1)
    if not lo <= mean <= hi:
        raise SnapshotError(f"{where}: meanPrice {mean} outside [{lo}, {hi}]")
    continuing = _int(value["nContinuing"], f"{where}.nContinuing")
    if continuing > n:
        raise SnapshotError(f"{where}: nContinuing {continuing} > n {n}")
    change = value["meanChange"]
    if continuing == 0:
        if change is not None:
            raise SnapshotError(f"{where}.meanChange: {change!r} with no continuing point")
    else:
        if change is None:
            raise SnapshotError(f"{where}.meanChange: missing while {continuing} points continue")
        _number(change, f"{where}.meanChange")
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
    reference = _text(snapshot["referenceDate"], "referenceDate")
    if not reference.startswith(f"{year}-"):
        raise SnapshotError(f"referenceDate {reference!r} is not in {year}")

    sources = snapshot["sources"]
    if not isinstance(sources, dict):
        raise SnapshotError("sources: not an object")
    for key in REQUIRED_SOURCES:
        entry = sources.get(key)
        if not isinstance(entry, dict):
            raise SnapshotError(f"sources[{key}]: missing")
        if _int(entry.get("year"), f"sources[{key}].year") != year:
            raise SnapshotError(f"sources[{key}].year {entry['year']} != year {year}")
        _text(entry.get("table"), f"sources[{key}].table")
        _text(entry.get("label"), f"sources[{key}].label")

    uses = snapshot["uses"]
    if not isinstance(uses, dict) or any(use not in uses for use in USES):
        raise SnapshotError("uses: expected residential and commercial")

    wards = snapshot["wards"]
    if not isinstance(wards, list):
        raise SnapshotError("wards: not a list")
    codes = [w.get("code") if isinstance(w, dict) else None for w in wards]
    if codes != WARD_CODES:
        raise SnapshotError(f"wards: expected the 23 特別区 codes in order, got {codes}")
    per_use_total = {use: 0 for use in USES}
    industrial_total = 0
    points_total = 0
    for w in wards:
        where = f"wards[{w['code']}]"
        _text(w.get("name"), f"{where}.name")
        n = _int(w.get("n"), f"{where}.n", minimum=1)
        parts = 0
        for use in USES:
            figures = _figures(w.get(use), f"{where}.{use}", minimum_points=1)
            per_use_total[use] += figures["n"]
            parts += figures["n"]
        industrial = w.get("industrial")
        if not isinstance(industrial, dict):
            raise SnapshotError(f"{where}.industrial: not an object")
        if "meanPrice" in industrial:
            raise SnapshotError(f"{where}.industrial: 工業地 carries a count only")
        parts += _int(industrial.get("n"), f"{where}.industrial.n")
        industrial_total += industrial["n"]
        if parts != n:
            raise SnapshotError(f"{where}: n {n} != 住宅地 + 商業地 + 工業地 {parts}")
        points_total += n

    total = snapshot["total"]
    if not isinstance(total, dict):
        raise SnapshotError("total: not an object")
    if _int(total.get("n"), "total.n") != points_total:
        raise SnapshotError(f"total.n {total['n']} != sum of wards {points_total}")
    for use in USES:
        figures = _figures(total.get(use), f"total.{use}", minimum_points=1)
        if figures["n"] != per_use_total[use]:
            raise SnapshotError(f"total.{use}.n {figures['n']} != sum of wards {per_use_total[use]}")
    industrial = total.get("industrial")
    if not isinstance(industrial, dict) or _int(industrial.get("n"), "total.industrial.n") != industrial_total:
        raise SnapshotError("total.industrial.n != sum of wards")

    credit = snapshot["credit"]
    if not isinstance(credit, dict):
        raise SnapshotError("credit: not an object")
    for key in REQUIRED_CREDITS:
        _text(credit.get(key), f"credit.{key}")
    if not credit["edited_l01"].endswith("を加工して作成") or "をもとに" in credit["edited_l01"]:
        raise SnapshotError("credit.edited_l01: not the 加工 form without an editor name")
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
        raise RuntimeError(f"land_prices snapshot unusable — refusing to start: {exc}") from exc


def rows(snapshot: dict) -> list[dict]:
    """The route's ``data``: one record per ward, in code order, in the client's shape."""
    return [
        {
            "region": w["name"],
            "code": w["code"],
            "n": w["n"],
            "residential": deepcopy(w["residential"]),
            "commercial": deepcopy(w["commercial"]),
            "industrial": {"n": w["industrial"]["n"]},
        }
        for w in snapshot["wards"]
    ]


def sources(snapshot: dict) -> dict[str, dict]:
    """Per field (price, change): the year, table and label — the /demographics ``sources`` shape."""
    return deepcopy(snapshot["sources"])
