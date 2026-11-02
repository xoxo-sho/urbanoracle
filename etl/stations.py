"""Stations and ridership snapshot for the 23 特別区 (real-data plan PR 4, RECON 2026-10-uo-real-data §9 row 4).

Two steps, both deterministic, nothing typed by hand, nothing beyond the
standard library:

  extract   the two raw 国土数値情報 zips (git-ignored downloads)
            → committed excerpts under backend/tests/fixtures/stations/
              (the S12 rows whose midpoint lies inside a 23-ward polygon,
              the 23-ward N03 polygons, and a sidecar meta with URL, size,
              sha256 and edition of each zip)
  build     committed excerpts → backend/data/stations.json (the snapshot
            /api/v1/transport serves)

Sources (Architect decision 3, 2026-11-02: S12 is the sole ridership source;
ODPT is removed)
------------------------------------------------------------------------------
S12  国土数値情報 駅別乗降客数データ 2024年度（令和6年度）版, S12-25_GML.zip
     (https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-S12-2024.html,
     更新履歴 2026年4月). One LineString row per 運営会社 × 路線 × 駅, with
     乗降客数2011 … 乗降客数2024 (人/日, 1日平均), each year's 重複コード
     (1 当該路線駅に記載 / 2 他路線駅に記載 / 3 駅なし), データ有無コード
     (1 データ有 / 2 データなし / 3 非公開 / 4 駅なし) and 備考. The
     position of a station is S12's own geometry — the midpoint of the
     row's line — so place and figure come from one dataset and no name
     join is needed. 乗降客数2024 is 2024年度 (FY2024): for 新宿, 東京, 池袋,
     渋谷 and 小岩 the JR東日本 rows equal exactly 2 × the 1日平均乗車人員 JR
     East publishes for 2024年度 (and 2023 likewise), so the JR figures are
     乗車人員 doubled — the snapshot says so in ``notes``.
N03  国土数値情報 行政区域データ 2026年（令和8年）1月1日時点 東京都,
     N03-20260101_13_GML.zip (KsjTmplt-N03-2026.html, 更新履歴 2026年4月):
     the 23 ward polygons (全国地方公共団体コード 13101–13123). Ward = the
     polygon containing the row's midpoint (even-odd point-in-polygon over
     every polygon and hole, as shapely's ``contains`` answers it — the two
     were compared on the full file when this was written).

Licence: both datasets are 「オープンデータ（CC_BY_4.0）」 under the 国土数値情報
利用規約 (https://nlftp.mlit.go.jp/ksj/other/agreement.html); credit in the
加工 form with no editor name (Architect decision 12, 2026-11-02), carried
in the snapshot.

Run (from the repo root, with -I so nothing in the download dir is imported):

  python -I etl/stations.py extract
  python -I etl/stations.py build
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = ROOT / "etl" / "_downloads"
FIXTURES = ROOT / "backend" / "tests" / "fixtures" / "stations"
SNAPSHOT = ROOT / "backend" / "data" / "stations.json"

KSJ_SITE = "https://nlftp.mlit.go.jp/ksj/"
KSJ_TERMS = "https://nlftp.mlit.go.jp/ksj/other/agreement.html"

# --- S12 駅別乗降客数 -----------------------------------------------------------

S12_ID = "S12-25"
S12_EDITION = "2024年度（令和6年度）版"
S12_YEAR = 2024  # the latest 乗降客数 column; FY2024, verified against JR East's 2024年度 乗車人員 (×2)
S12_PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-S12-2024.html"
S12_ZIP_URL = "https://nlftp.mlit.go.jp/ksj/gml/data/S12/S12-25/S12-25_GML.zip"
S12_ZIP = "S12-25_GML.zip"
S12_GEOJSON = Path("S12-25_GML") / "UTF-8" / "S12-25_NumberOfPassengers.geojson"
S12_DOWNLOAD_DIR = DOWNLOADS / "ksj_S12-25"
S12_EXCERPT = "ksj_S12-25_tokyo23.geojson"

# Attribute layout (製品仕様書 第3.3版; the datalist page): five fixed
# attributes, then per year from 2011 four in a row — 重複コード, データ有無コード,
# 備考, 乗降客数.
FIRST_YEAR, LAST_YEAR = 2011, 2024
NAME, STATION_CODE, GROUP_CODE, OPERATOR, LINE = "S12_001", "S12_001c", "S12_001g", "S12_002", "S12_003"
RAIL_CLASS, OPERATOR_TYPE = "S12_004", "S12_005"
DUP_THIS_ROW, DUP_OTHER_ROW, DUP_NO_STATION, DATA_PRESENT = 1, 2, 3, 1


def column(year: int, kind: int) -> str:
    """kind: 0 重複コード, 1 データ有無コード, 2 備考, 3 乗降客数."""
    if not FIRST_YEAR <= year <= LAST_YEAR or kind not in range(4):
        raise ValueError((year, kind))
    return f"S12_{6 + 4 * (year - FIRST_YEAR) + kind:03d}"


assert column(2011, 3) == "S12_009" and column(2024, 3) == "S12_061"

# --- N03 行政区域 ----------------------------------------------------------------

N03_ID = "N03-20260101"
N03_EDITION = "2026年（令和8年）1月1日時点"
N03_YEAR = 2026
N03_PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html"
N03_ZIP_URL = "https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2026/N03-20260101_13_GML.zip"
N03_ZIP = "N03-20260101_13_GML.zip"
N03_GEOJSON = Path("N03-20260101_13.geojson")
N03_DOWNLOAD_DIR = DOWNLOADS / "ksj_N03-20260101_13"
N03_EXCERPT = "ksj_N03-20260101_tokyo23.geojson"
N03_CODE, N03_NAME = "N03_007", "N03_004"

META = "ksj.meta.json"
WARD_CODES = [f"131{n:02d}" for n in range(1, 24)]

REGION = "東京23区"
LICENCE = {
    "name": "国土数値情報 利用規約（PDL1.0準拠）— 駅別乗降客数データ・行政区域データはいずれも「オープンデータ（CC_BY_4.0）」",
    "url": KSJ_TERMS,
}
CREDIT = {
    "source": f"出典：国土交通省国土数値情報ダウンロードサイト（{KSJ_SITE}）",
    "edited_s12": f"「国土数値情報（駅別乗降客数データ）」（国土交通省）（{KSJ_SITE}）を加工して作成",
    "edited_n03": f"「国土数値情報（行政区域データ）」（国土交通省）（{KSJ_SITE}）を加工して作成",
    "pages": {"S12": S12_PAGE, "N03": N03_PAGE},
}
NOTES = {
    "definition": "事業者ごとの駅別乗降客数の合計（乗換客は事業者ごとに数えられます）",
    "jr_east": "JR東日本の値は乗車人員を2倍した値（原典資料による）",
    "jr_east_evidence": (
        "JR東日本「各駅の乗車人員」2024年度 (https://www.jreast.co.jp/company/data/passenger/) と 2023年度 "
        "(https://www.jreast.co.jp/company/data/passenger/2023.html) の1日平均乗車人員（新宿・東京・池袋・渋谷・小岩）に対し、"
        "S12 の乗降客数2024 / 乗降客数2023 の東日本旅客鉄道の行はいずれもその2倍に一致（2026-11-02 確認）。"
    ),
    "position": "駅の位置は S12 の線形（国土数値情報（鉄道）駅データと同じ位置）の中点；区は N03 の区ポリゴンがその中点を含むもの",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --- geometry (standard library only) -------------------------------------------


def midpoint(coords: list[list[float]]) -> tuple[float, float]:
    """The point halfway along the line's length (degrees, as the file is)."""
    if len(coords) < 2:
        x, y = coords[0]
        return float(x), float(y)
    lengths = [math.dist(coords[i], coords[i + 1]) for i in range(len(coords) - 1)]
    total = sum(lengths)
    if total == 0:
        x, y = coords[0]
        return float(x), float(y)
    half, run = total / 2, 0.0
    for i, seg in enumerate(lengths):
        if run + seg >= half:
            t = (half - run) / seg if seg else 0.0
            (x0, y0), (x1, y1) = coords[i], coords[i + 1]
            return x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        run += seg
    x, y = coords[-1]
    return float(x), float(y)


def _ring_contains(ring: list[list[float]], x: float, y: float) -> bool:
    """Even-odd crossing test (a point on the boundary is not inside)."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y):
            cross = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < cross:
                inside = not inside
        j = i
    return inside


class WardIndex:
    """The 23 ward MultiPolygons with per-polygon bounding boxes."""

    def __init__(self, features: list[dict]) -> None:
        self.polygons: list[tuple[str, str, tuple[float, float, float, float], list[list[list[float]]]]] = []
        self.names: dict[str, str] = {}
        for f in features:
            code, name = f["properties"][N03_CODE], f["properties"][N03_NAME]
            self.names[code] = name
            geometry = f["geometry"]
            polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
            for poly in polys:
                outer = poly[0]
                xs, ys = [p[0] for p in outer], [p[1] for p in outer]
                self.polygons.append((code, name, (min(xs), min(ys), max(xs), max(ys)), poly))
        if sorted(self.names) != WARD_CODES:
            raise ValueError(f"ward polygons: {sorted(self.names)}")

    def ward_of(self, x: float, y: float) -> tuple[str, str] | None:
        for code, name, (x0, y0, x1, y1), poly in self.polygons:
            if not (x0 <= x <= x1 and y0 <= y <= y1):
                continue
            if _ring_contains(poly[0], x, y) and not any(_ring_contains(hole, x, y) for hole in poly[1:]):
                return code, name
        return None


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _dump(path: Path, obj: dict) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


# --- extract ----------------------------------------------------------------------


def extract(out_dir: Path = FIXTURES, today: date | None = None) -> None:
    n03_zip, s12_zip = N03_DOWNLOAD_DIR / N03_ZIP, S12_DOWNLOAD_DIR / S12_ZIP
    n03 = _load(N03_DOWNLOAD_DIR / N03_GEOJSON)
    wards = [
        f
        for f in n03["features"]
        if isinstance(f["properties"].get(N03_CODE), str) and f["properties"][N03_CODE] in WARD_CODES
    ]
    index = WardIndex(wards)

    s12 = _load(S12_DOWNLOAD_DIR / S12_GEOJSON)
    kept: list[dict] = []
    for f in s12["features"]:
        if f["geometry"]["type"] != "LineString":
            raise ValueError(f"{f['properties'].get(NAME)}: geometry {f['geometry']['type']}")
        x, y = midpoint(f["geometry"]["coordinates"])
        if index.ward_of(x, y) is not None:
            kept.append(f)

    out_dir.mkdir(parents=True, exist_ok=True)
    _dump(out_dir / N03_EXCERPT, {"type": "FeatureCollection", "name": f"{N03_ID} 東京都 特別区 13101–13123", "features": wards})
    _dump(out_dir / S12_EXCERPT, {"type": "FeatureCollection", "name": f"{S12_ID} rows inside the 23 特別区", "features": kept})
    meta = {
        "fetched": (today or date.today()).isoformat(),
        "S12": {
            "id": S12_ID,
            "title": "国土数値情報 駅別乗降客数データ",
            "edition": S12_EDITION,
            "latest_column": f"乗降客数{S12_YEAR}",
            "page": S12_PAGE,
            "url": S12_ZIP_URL,
            "file": S12_ZIP,
            "bytes": s12_zip.stat().st_size,
            "sha256": sha256(s12_zip),
            "published": "2026-04（更新履歴「2026年4月：2024年度（令和6年度）版に更新しました。」）",
            "licence": "オープンデータ（CC_BY_4.0）",
            "rows_total": len(s12["features"]),
            "rows_kept": len(kept),
            "cut": "rows whose line midpoint lies inside one of the 23 ward polygons of the N03 excerpt; every attribute and the geometry kept verbatim",
        },
        "N03": {
            "id": N03_ID,
            "title": "国土数値情報 行政区域データ（東京都）",
            "edition": N03_EDITION,
            "page": N03_PAGE,
            "url": N03_ZIP_URL,
            "file": N03_ZIP,
            "bytes": n03_zip.stat().st_size,
            "sha256": sha256(n03_zip),
            "published": "2026-04（更新履歴「2026年4月：2026年（令和8年）版に更新しました。」）",
            "licence": "オープンデータ（CC_BY_4.0）",
            "features_total": len(n03["features"]),
            "features_kept": len(wards),
            "cut": "features whose N03_007 is 13101–13123; geometry kept verbatim",
        },
    }
    (out_dir / META).write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {out_dir / S12_EXCERPT} ({len(kept)} rows), {out_dir / N03_EXCERPT} ({len(wards)} features) and {out_dir / META}")


# --- build ------------------------------------------------------------------------


def _figure(props: dict, year: int) -> int | None:
    """The row's 乗降客数 for ``year`` when this row carries it, else None."""
    if props[column(year, 0)] != DUP_THIS_ROW or props[column(year, 1)] != DATA_PRESENT:
        return None
    value = props[column(year, 3)]
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{props[NAME]} {props[OPERATOR]} {props[LINE]}: 乗降客数{year} {value!r}")
    return value


def build(fixtures: Path = FIXTURES) -> dict:
    meta = json.loads((fixtures / META).read_text(encoding="utf-8"))
    n03, s12 = _load(fixtures / N03_EXCERPT), _load(fixtures / S12_EXCERPT)
    index = WardIndex(n03["features"])
    year = S12_YEAR

    rows: list[dict] = []
    straddling: list[dict] = []
    dropped: list[dict] = []
    for f in s12["features"]:
        p = f["properties"]
        coords = f["geometry"]["coordinates"]
        x, y = midpoint(coords)
        ward = index.ward_of(x, y)
        if ward is None:
            raise ValueError(f"{p[NAME]} {p[OPERATOR]}: midpoint outside every ward")
        if p[column(year, 0)] == DUP_NO_STATION:
            # 重複コード 3 駅なし: no station there in this year (e.g. the 上野懸垂線,
            # closed 2023-12-31); not a station of the snapshot's year.
            dropped.append({"name": p[NAME], "operator": p[OPERATOR], "line": p[LINE], "ward": ward[1], "reason": f"重複コード{year} = 3 駅なし"})
            continue
        w0, w1 = index.ward_of(*coords[0]), index.ward_of(*coords[-1])
        if w0 != w1:
            straddling.append(
                {
                    "name": p[NAME],
                    "operator": p[OPERATOR],
                    "line": p[LINE],
                    "ends": [w[1] if w else None for w in (w0, w1)],
                    "assigned": ward[1],
                }
            )
        rows.append({"props": p, "ward": ward, "point": (round(x, 6), round(y, 6))})

    # one station per (group code, ward): the rows of a same-name station
    # cluster that fall in this ward
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in rows:
        groups[(r["props"][GROUP_CODE], r["ward"][0])].append(r)

    stations: list[dict] = []
    for (group, ward_code), members in groups.items():
        anchor = next((r for r in members if r["props"][STATION_CODE] == group), members[0])
        names = {r["props"][NAME] for r in members}
        if len(names) != 1:
            raise ValueError(f"group {group}: names {names}")
        by_operator: dict[str, list[dict]] = defaultdict(list)
        for r in members:
            by_operator[r["props"][OPERATOR]].append(r)
        operators = []
        for operator, ors in by_operator.items():
            figures = [v for v in (_figure(r["props"], year) for r in ors) if v is not None]
            operators.append(
                {
                    "name": operator,
                    "lines": sorted({r["props"][LINE] for r in ors}),
                    "rows": len(ors),
                    "figureRows": len(figures),
                    "passengers": sum(figures) if figures else None,
                }
            )
        operators.sort(key=lambda o: (-(o["passengers"] or 0), o["name"]))
        known = [o["passengers"] for o in operators if o["passengers"] is not None]
        lng, lat = anchor["point"]
        station = {
            "code": group,
            "name": anchor["props"][NAME],
            "ward": anchor["ward"][1],
            "wardCode": ward_code,
            "lat": lat,
            "lng": lng,
            "dailyPassengers": sum(known) if known else None,
            "operators": operators,
        }
        if not known and all(r["props"][column(year, 0)] == DUP_OTHER_ROW for r in members):
            # Every row says 他路線駅に記載: S12 counts this station on another
            # row (another group, or the same group across a ward boundary).
            station["note"] = f"乗降客数{year}は国土数値情報 S12 で他路線駅の行に記載（重複コード2）"
        stations.append(station)
    # A group whose every row says 他路線駅に記載 (重複コード 2) has its figure on
    # another group's row: when exactly one same-name group in the same ward
    # carries figures, it is that station (the 京葉線 platform of 東京, the
    # 有楽町線 platform of 池袋), so fold it in; otherwise it stays, with no
    # figure, as S12 lists it (a group split by a ward boundary, for example).
    merged: list[dict] = []
    by_name_ward: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for st in stations:
        by_name_ward[(st["name"], st["wardCode"])].append(st)
    folded: set[str] = set()
    for (name, ward_code), group in by_name_ward.items():
        with_figures = [st for st in group if any(o["figureRows"] for o in st["operators"])]
        without = [st for st in group if not any(o["figureRows"] for o in st["operators"])]
        if len(group) > 1 and len(with_figures) == 1 and without:
            target = with_figures[0]
            for st in without:
                for op in st["operators"]:
                    mine = next((o for o in target["operators"] if o["name"] == op["name"]), None)
                    if mine is None:
                        target["operators"].append(dict(op))
                    else:
                        mine["lines"] = sorted(set(mine["lines"]) | set(op["lines"]))
                        mine["rows"] += op["rows"]
                merged.append({"name": name, "ward": target["ward"], "code": st["code"], "into": target["code"], "operators": [o["name"] for o in st["operators"]]})
                folded.add(st["code"] + "/" + ward_code)
    stations = [st for st in stations if st["code"] + "/" + st["wardCode"] not in folded]
    for st in stations:
        st["operators"].sort(key=lambda o: (-(o["passengers"] or 0), o["name"]))
    stations.sort(key=lambda s: (s["wardCode"], -(s["dailyPassengers"] or 0), s["code"]))

    wards = []
    for code in WARD_CODES:
        mine = [s for s in stations if s["wardCode"] == code]
        if not mine:
            raise ValueError(f"{code} {index.names[code]}: no station")
        wards.append(
            {
                "code": code,
                "name": index.names[code],
                "stations": len(mine),
                "passengers": sum(s["dailyPassengers"] or 0 for s in mine),
                "figureRows": sum(o["figureRows"] for s in mine for o in s["operators"]),
            }
        )

    return {
        "region": REGION,
        "year": year,
        "reference": f"{S12_EDITION} 駅別乗降客数（{year}年度、1日平均、人/日）；区の判定は {N03_EDITION} の行政区域",
        "sources": {
            "ridership": {
                "year": year,
                "table": S12_ID,
                "label": f"国土数値情報 駅別乗降客数データ {S12_EDITION} 乗降客数{year}（1日平均、人/日）",
            },
            "stations": {
                "year": year,
                "table": S12_ID,
                "label": f"国土数値情報 駅別乗降客数データ {S12_EDITION} 駅名・運営会社・路線名・位置（線形の中点）",
            },
            "wards": {
                "year": N03_YEAR,
                "table": N03_ID,
                "label": f"国土数値情報 行政区域データ {N03_EDITION} 東京都（区の判定：中点の包含）",
            },
        },
        "inputs": {
            S12_EXCERPT: {
                "path": f"backend/tests/fixtures/stations/{S12_EXCERPT}",
                "sha256": sha256(fixtures / S12_EXCERPT),
                "cut_from": meta["S12"],
            },
            N03_EXCERPT: {
                "path": f"backend/tests/fixtures/stations/{N03_EXCERPT}",
                "sha256": sha256(fixtures / N03_EXCERPT),
                "cut_from": meta["N03"],
            },
        },
        "licence": LICENCE,
        "credit": CREDIT,
        "notes": NOTES,
        "straddlingRows": straddling,
        "droppedRows": dropped,
        "mergedGroups": merged,
        "wards": wards,
        "stations": stations,
    }


def main(argv: list[str]) -> int:
    if argv[1:] == ["extract"]:
        extract()
    elif argv[1:] == ["build"]:
        snapshot = build()
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(
            f"wrote {SNAPSHOT} ({len(snapshot['stations'])} stations in {len(snapshot['wards'])} wards, "
            f"{len(snapshot['straddlingRows'])} straddling rows, {len(snapshot['droppedRows'])} dropped, {len(snapshot['mergedGroups'])} merged)"
        )
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
