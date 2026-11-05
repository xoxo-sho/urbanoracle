"""災害: the committed snapshot (real-data plan PR 7).

``backend/data/disaster_risks.json`` is built by ``etl/disaster.py`` from the
committed excerpts under tests/fixtures/disaster/ (RECON 2026-10-uo-real-data
§9 row 7; the fixture README records the provenance). Per ward, each hazard in
its source's own classes (Architect decisions 1, 8, 11 and sub-decisions,
2026-11-05):

  earthquake  東京都「地震に関する地域危険度測定調査（第9回）」: the ward's 町丁目
              per rank 1–5 for 総合危険度, 建物倒壊危険度 and 火災危険度 — a
              relative evaluation among the 都's 5,192 町丁目 — and the rank-5
              count with its share (K2 and the choropleth);
  flood       国土数値情報 A31a-25 想定最大規模 (東京都 and 関東地方整備局): the
              share of the N03 ward area per 浸水深 class, the deepest class
              winning where rivers overlap, and the ≥ 3 m share;
  landslide   国土数値情報 A33-25: 警戒区域 / 特別警戒区域 per 現象 (0 is a zero);
  tsunami     対象外 with its basis: 東京都's 津波浸水想定 covers the 島しょ部 only
              and A40-23 has no polygon in the 23 wards;
  hightide    国土数値情報 A49-20 (2020年度): the share of the ward area per class.

No ``level`` field and no scale of ours. The route has no upstream, so the
only thing that can be wrong is the file itself — checked when the app module
is imported (``check_at_startup``): a missing or malformed snapshot stops the
process, Cloud Run refuses the revision and the deploy fails.
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
HAZARDS = ("earthquake", "flood", "landslide", "tsunami", "hightide")
REQUIRED_KEYS = ("region", "sources", "hazards", "inputs", "licence", "credit", "notices", "notes", "total", "wards")
KINDS = ("total", "building", "fire")
FLOOD_CODES = list(range(1, 7))
HIGHTIDE_CODES = list(range(1, 8))
FLOOD_DEEP_FROM = 3
PHENOMENA = ["急傾斜地の崩壊", "土石流", "地滑り"]
EDITED_CREDITS = ("edited_a31", "edited_a33", "edited_a40", "edited_a49", "edited_n03")
# A 対象外 must carry its basis (Architect, 2026-11-05: never a bare 0 or 対象外).
TSUNAMI_BASIS_WORDS = ("対象外", "島しょ部", "A40")
CC_BY_WORDS = "クリエイティブ・コモンズ・ライセンス 表示4.0国際"
SHARE_TOLERANCE = 1e-3


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


def _obj(value: Any, where: str) -> dict:
    if not isinstance(value, dict):
        raise SnapshotError(f"{where}: not an object")
    return value


def _no_level(value: Any, where: str) -> None:
    if isinstance(value, dict):
        if "level" in value:
            raise SnapshotError(f"{where}: carries a `level` field (no Lv scale exists in the sources)")
        for k, v in value.items():
            _no_level(v, f"{where}.{k}")
    elif isinstance(value, list):
        for i, v in enumerate(value):
            _no_level(v, f"{where}[{i}]")


def _earthquake(value: Any, where: str) -> dict:
    e = _obj(value, where)
    n = _int(e.get("n"), f"{where}.n", minimum=1)
    ranks = _obj(e.get("ranks"), f"{where}.ranks")
    if sorted(ranks) != sorted(KINDS):
        raise SnapshotError(f"{where}.ranks: expected {KINDS}, got {sorted(ranks)}")
    for kind in KINDS:
        counts = ranks[kind]
        if not isinstance(counts, list) or len(counts) != 5:
            raise SnapshotError(f"{where}.ranks.{kind}: expected five counts (ranks 1–5)")
        for i, c in enumerate(counts):
            _int(c, f"{where}.ranks.{kind}[{i}]")
        if sum(counts) != n:
            raise SnapshotError(f"{where}.ranks.{kind}: counts sum to {sum(counts)}, not n {n}")
    rank5 = _int(e.get("rank5"), f"{where}.rank5")
    if rank5 != ranks["total"][4]:
        raise SnapshotError(f"{where}.rank5 {rank5} is not the 総合危険度 rank-5 count {ranks['total'][4]}")
    share = _number(e.get("rank5Share"), f"{where}.rank5Share", minimum=0)
    if abs(share - round(rank5 / n * 100, 4)) > SHARE_TOLERANCE:
        raise SnapshotError(f"{where}.rank5Share {share} != rank5 / n")
    if "相対評価" not in _text(e.get("relative"), f"{where}.relative"):
        raise SnapshotError(f"{where}.relative: does not say the ranks are a relative evaluation")
    return e


def _classes(value: Any, where: str, codes: list[int], deep_from: int | None) -> dict:
    b = _obj(value, where)
    ward_m2 = _number(b.get("wardM2"), f"{where}.wardM2", minimum=1)
    classes = b.get("classes")
    if not isinstance(classes, list) or [c.get("code") if isinstance(c, dict) else None for c in classes] != codes:
        raise SnapshotError(f"{where}.classes: expected codes {codes}")
    inside = 0.0
    for c in classes:
        cw = f"{where}.classes[{c['code']}]"
        _text(c.get("label"), f"{cw}.label")
        m2 = _number(c.get("m2"), f"{cw}.m2", minimum=0)
        share = _number(c.get("share"), f"{cw}.share", minimum=0)
        if abs(share - m2 / ward_m2 * 100) > SHARE_TOLERANCE:
            raise SnapshotError(f"{cw}.share {share} != m2 / wardM2")
        inside += m2
    if inside > ward_m2 * (1 + 1e-9):
        raise SnapshotError(f"{where}: class areas {inside} exceed the ward {ward_m2}")
    if abs(_number(b.get("m2"), f"{where}.m2", minimum=0) - inside) > 0.01:
        raise SnapshotError(f"{where}.m2 is not the sum of the classes")
    if abs(_number(b.get("share"), f"{where}.share", minimum=0) - inside / ward_m2 * 100) > SHARE_TOLERANCE:
        raise SnapshotError(f"{where}.share is not m2 / wardM2")
    if deep_from is not None:
        deep = sum(c["m2"] for c in classes if c["code"] >= deep_from)
        if abs(_number(b.get("deepShare"), f"{where}.deepShare", minimum=0) - deep / ward_m2 * 100) > SHARE_TOLERANCE:
            raise SnapshotError(f"{where}.deepShare is not the share of classes ≥ {deep_from}")
    return b


def _landslide(value: Any, where: str) -> dict:
    b = _obj(value, where)
    phenomena = b.get("phenomena")
    if not isinstance(phenomena, list) or [p.get("name") if isinstance(p, dict) else None for p in phenomena] != PHENOMENA:
        raise SnapshotError(f"{where}.phenomena: expected {PHENOMENA}")
    for p in phenomena:
        _int(p.get("warning"), f"{where}.{p['name']}.warning")
        _int(p.get("special"), f"{where}.{p['name']}.special")
    if _int(b.get("warning"), f"{where}.warning") != sum(p["warning"] for p in phenomena):
        raise SnapshotError(f"{where}.warning is not the sum over the 現象")
    if _int(b.get("special"), f"{where}.special") != sum(p["special"] for p in phenomena):
        raise SnapshotError(f"{where}.special is not the sum over the 現象")
    return b


def _tsunami(value: Any, where: str) -> dict:
    b = _obj(value, where)
    if b.get("status") != "notCovered":
        raise SnapshotError(f"{where}.status: {b.get('status')!r} — A40-23 has no polygon in the 23 wards")
    text = _text(b.get("text"), f"{where}.text")
    if not all(w in text for w in TSUNAMI_BASIS_WORDS):
        raise SnapshotError(f"{where}.text: 対象外 without its basis: {text!r}")
    return b


def _record(value: Any, where: str) -> dict:
    r = _obj(value, where)
    _text(r.get("name"), f"{where}.name")
    for hazard in HAZARDS:
        if hazard not in r:
            raise SnapshotError(f"{where}: lacks {hazard}")
    _earthquake(r["earthquake"], f"{where}.earthquake")
    _classes(r["flood"], f"{where}.flood", FLOOD_CODES, FLOOD_DEEP_FROM)
    _landslide(r["landslide"], f"{where}.landslide")
    _tsunami(r["tsunami"], f"{where}.tsunami")
    _classes(r["hightide"], f"{where}.hightide", HIGHTIDE_CODES, None)
    if abs(r["flood"]["wardM2"] - r["hightide"]["wardM2"]) > 1e-6:
        raise SnapshotError(f"{where}: flood and hightide name different ward areas")
    return r


def validate(snapshot: Any) -> None:
    """Raise SnapshotError unless ``snapshot`` is a complete, consistent snapshot."""
    s = _obj(snapshot, "snapshot")
    missing = [k for k in REQUIRED_KEYS if k not in s]
    if missing:
        raise SnapshotError(f"snapshot lacks {missing}")
    _no_level(s, "snapshot")
    _text(s["region"], "region")
    sources = _obj(s["sources"], "sources")
    for key in (*HAZARDS, "wards"):
        entry = _obj(sources.get(key), f"sources[{key}]")
        _int(entry.get("year"), f"sources[{key}].year", minimum=1970)
        _text(entry.get("table"), f"sources[{key}].table")
        _text(entry.get("label"), f"sources[{key}].label")

    wards = s["wards"]
    if not isinstance(wards, list) or [w.get("code") if isinstance(w, dict) else None for w in wards] != WARD_CODES:
        raise SnapshotError("wards: expected the 23 特別区 codes in order")
    for w in wards:
        _record(w, f"wards[{w['code']}]")
    total = _record(s["total"], "total")
    if total.get("code") != TOTAL_CODE:
        raise SnapshotError(f"total.code: {total.get('code')!r} is not {TOTAL_CODE}")
    for kind in KINDS:
        summed = [sum(w["earthquake"]["ranks"][kind][i] for w in wards) for i in range(5)]
        if total["earthquake"]["ranks"][kind] != summed:
            raise SnapshotError(f"total.earthquake.ranks.{kind} is not the sum over the wards")
    if total["earthquake"]["rank5"] != sum(w["earthquake"]["rank5"] for w in wards):
        raise SnapshotError("total.earthquake.rank5 is not the sum over the wards")
    for hazard in ("flood", "hightide"):
        if abs(total[hazard]["wardM2"] - sum(w[hazard]["wardM2"] for w in wards)) > 0.1:
            raise SnapshotError(f"total.{hazard}.wardM2 is not the sum over the wards")
        for i, c in enumerate(total[hazard]["classes"]):
            if abs(c["m2"] - sum(w[hazard]["classes"][i]["m2"] for w in wards)) > 0.1:
                raise SnapshotError(f"total.{hazard} class {c['code']} is not the sum over the wards")

    credit = _obj(s["credit"], "credit")
    for key in EDITED_CREDITS:
        text = _text(credit.get(key), f"credit.{key}")
        if not text.endswith("を加工して作成") or "をもとに" in text:
            raise SnapshotError(f"credit.{key}: not the 加工 form without an editor name")
    _text(credit.get("source"), "credit.source")
    if CC_BY_WORDS not in _text(credit.get("kikendo"), "credit.kikendo") or "東京都" not in credit["kikendo"]:
        raise SnapshotError("credit.kikendo: not the 東京都 CC BY credit")
    if "改変して利用しています" not in _text(credit.get("kikendo_edited"), "credit.kikendo_edited"):
        raise SnapshotError("credit.kikendo_edited: no 改変 statement")
    licence = _obj(s["licence"], "licence")
    _text(_obj(licence.get("earthquake"), "licence.earthquake").get("basis"), "licence.earthquake.basis")
    _text(_obj(licence.get("ksj"), "licence.ksj").get("url"), "licence.ksj.url")
    tsunami = _obj(_obj(s["hazards"], "hazards").get("tsunami"), "hazards.tsunami")
    basis = tsunami.get("basis")
    if not isinstance(basis, list) or not basis or not all(isinstance(b, dict) and b.get("url") and b.get("quote") for b in basis):
        raise SnapshotError("hazards.tsunami.basis: the documents behind 対象外 are missing")


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
        raise RuntimeError(f"disaster snapshot unusable — refusing to start: {exc}") from exc


def _client(record: dict) -> dict:
    """One ward (or the 23区) in the client's shape: ``name`` becomes ``region``."""
    out = {k: deepcopy(v) for k, v in record.items() if k != "name"}
    out["region"] = record["name"]
    return out


def rows(snapshot: dict) -> list[dict]:
    """The route's ``data``: one record per ward, in code order."""
    return [_client(w) for w in snapshot["wards"]]


def total(snapshot: dict) -> dict:
    """The 23区 record, in the client's shape."""
    return _client(snapshot["total"])


def sources(snapshot: dict) -> dict[str, dict]:
    """Per hazard (and the ward polygons): the year, table and label — the ``sources`` shape every route uses."""
    return deepcopy(snapshot["sources"])
