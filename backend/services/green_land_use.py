"""公園・農地・森林など: the committed land-use snapshot (real-data plan PR 8).

``backend/data/green_land_use.json`` is built by ``etl/green.py`` from the
committed CSV under tests/fixtures/green/ — 東京都都市整備局「東京の土地利用
令和３年東京都区部」（表－１）令和３年土地面積（区部・区別）, CC BY as read on the
東京都オープンデータAPIカタログ (Architect decision 6, 2026-11-09). Per ward the
share of the survey's own ward total that is 公園等, 農用地, 森林 or 原野, with
each class's hectares; the 23区 figure over the 23 ward rows summed (the CSV's
区部 row also counts 中央防波堤).

Like the other snapshots, the only thing that can be wrong is the file itself,
checked when the app module is imported (``check_at_startup``): a missing or
malformed snapshot stops the process and Cloud Run refuses the revision.
"""

from __future__ import annotations

import json
import math
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

WARD_CODES = [f"131{n:02d}" for n in range(1, 24)]
TOTAL_CODE = "13100"
CLASS_KEYS = ["park", "farm", "forest", "wild"]
CLASS_NAMES = ["公園等", "農用地", "森林", "原野"]
REQUIRED_KEYS = ("region", "year", "sources", "label", "classes", "totalColumn", "inputs", "licence", "credit", "notes", "total", "wards")
CC_BY_WORDS = "クリエイティブ・コモンズ・ライセンス 表示4.0国際"


class SnapshotError(ValueError):
    """The snapshot file is missing, not JSON, or not the shape the route serves."""


def _number(value: Any, where: str, *, minimum: float = 0.0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise SnapshotError(f"{where}: expected a finite number, got {value!r}")
    if value < minimum:
        raise SnapshotError(f"{where}: {value} < {minimum}")
    return float(value)


def _text(value: Any, where: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SnapshotError(f"{where}: expected non-empty text, got {value!r}")
    return value


def _record(value: Any, where: str) -> dict:
    if not isinstance(value, dict):
        raise SnapshotError(f"{where}: not an object")
    _text(value.get("name"), f"{where}.name")
    total = _number(value.get("totalHa"), f"{where}.totalHa", minimum=0.1)
    classes = value.get("classes")
    if not isinstance(classes, list) or [c.get("key") if isinstance(c, dict) else None for c in classes] != CLASS_KEYS:
        raise SnapshotError(f"{where}.classes: expected {CLASS_KEYS}")
    if [c.get("name") for c in classes] != CLASS_NAMES:
        raise SnapshotError(f"{where}.classes: names are not the survey's {CLASS_NAMES}")
    green = sum(_number(c.get("ha"), f"{where}.classes.{c['key']}.ha") for c in classes)
    if abs(_number(value.get("greenHa"), f"{where}.greenHa") - green) > 0.11:
        raise SnapshotError(f"{where}.greenHa is not the sum of the four classes")
    if green > total + 0.05:
        raise SnapshotError(f"{where}: the four classes exceed the ward total")
    share = _number(value.get("share"), f"{where}.share")
    if abs(share - value["greenHa"] / total * 100) > 1e-3:
        raise SnapshotError(f"{where}.share {share} != greenHa / totalHa")
    return value


def validate(snapshot: Any) -> None:
    """Raise SnapshotError unless ``snapshot`` is a complete, consistent snapshot."""
    if not isinstance(snapshot, dict):
        raise SnapshotError("snapshot is not an object")
    missing = [k for k in REQUIRED_KEYS if k not in snapshot]
    if missing:
        raise SnapshotError(f"snapshot lacks {missing}")
    source = snapshot["sources"].get("green") if isinstance(snapshot["sources"], dict) else None
    if not isinstance(source, dict):
        raise SnapshotError("sources.green: missing")
    if not isinstance(source.get("year"), int) or source["year"] != snapshot["year"]:
        raise SnapshotError("sources.green.year is not the snapshot's year")
    _text(source.get("table"), "sources.green.table")
    _text(source.get("label"), "sources.green.label")
    label = _text(snapshot["label"], "label")
    if not all(n in label for n in CLASS_NAMES):
        raise SnapshotError("label: does not name every class it counts")
    wards = snapshot["wards"]
    if not isinstance(wards, list) or [w.get("code") if isinstance(w, dict) else None for w in wards] != WARD_CODES:
        raise SnapshotError("wards: expected the 23 特別区 codes in order")
    for w in wards:
        _record(w, f"wards[{w['code']}]")
    total = _record(snapshot["total"], "total")
    if total.get("code") != TOTAL_CODE:
        raise SnapshotError(f"total.code is not {TOTAL_CODE}")
    if abs(total["totalHa"] - sum(w["totalHa"] for w in wards)) > 0.15 or abs(total["greenHa"] - sum(w["greenHa"] for w in wards)) > 0.15:
        raise SnapshotError("total: not the sum of the 23 ward rows")
    credit = snapshot["credit"]
    if not isinstance(credit, dict) or CC_BY_WORDS not in _text(credit.get("tokyo"), "credit.tokyo") or "東京都" not in credit["tokyo"]:
        raise SnapshotError("credit.tokyo: not the 東京都 CC BY credit")
    if "改変して利用しています" not in _text(credit.get("tokyo_edited"), "credit.tokyo_edited"):
        raise SnapshotError("credit.tokyo_edited: no 改変 statement")
    _text(snapshot["licence"].get("basis") if isinstance(snapshot["licence"], dict) else None, "licence.basis")


def load(path: Path) -> dict:
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
    return _cached(str(path))


def check_at_startup(path: Path) -> None:
    try:
        get(path)
    except SnapshotError as exc:
        raise RuntimeError(f"green land-use snapshot unusable — refusing to start: {exc}") from exc


def _client(record: dict) -> dict:
    out = {k: deepcopy(v) for k, v in record.items() if k != "name"}
    out["region"] = record["name"]
    return out


def rows(snapshot: dict) -> list[dict]:
    return [_client(w) for w in snapshot["wards"]]


def total(snapshot: dict) -> dict:
    return _client(snapshot["total"])


def sources(snapshot: dict) -> dict[str, dict]:
    return deepcopy(snapshot["sources"])
