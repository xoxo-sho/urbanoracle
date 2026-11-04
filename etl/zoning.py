"""用途地域 snapshot for the 23 特別区 (real-data plan PR 6, RECON 2026-10-uo-real-data §9 row 6).

Three steps, nothing typed by hand:

  extract   the raw 国土数値情報 A55 zip and its 公表自治体及び掲載データ一覧 xlsx
            (git-ignored downloads) + the committed N03 ward polygons of PR 4
            → committed excerpts under backend/tests/fixtures/zoning/:
              - one CSV row per 用途地域 polygon of the 23 wards with its
                attributes, its area and the part of it inside its N03 ward
                polygon (the builder's input);
              - the raw geometry of the 千代田区 and 江戸川区 layers as GeoJSON
                (the guards re-derive those two wards' areas from it);
              - the per-ward 時点 table derived from the xlsx (Architect
                decision 2026-11-03, way 1);
              - a sidecar meta with every raw file's URL, size and sha256.
            Needs pyshp, shapely and openpyxl (etl/requirements.txt); pyproj,
            if installed, cross-checks the projection below.
  build     committed excerpts → backend/data/zoning.json, the snapshot
            /api/v1/zoning serves. Standard library only, so the drift test
            re-runs it in CI.
  verify    re-derives the two committed wards' polygon areas from the GeoJSON
            with the standard library and compares them with the CSV.

Source (Architect decision 2, 2026-11-03)
------------------------------------------------------------------------------
A55  国土数値情報 都市計画決定情報データ 2024年度（令和6年度）版, 東京都,
     A55-24_13000_SHP.zip (https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A55-2024.html,
     更新履歴「2025年11月：2024年度（令和6年度）版に更新しました。」). One folder per
     municipality; the 用途地域 layer is <city>_youto.shp with YoutoName,
     YoutoCode (1–13, A55_R6_AttributeCodelist: NOT A29's or 東京都's numbering —
     8 is 田園住居地域, 9 近隣商業地域, 13 工業専用地域), FAR 容積率 (%), BCR
     建蔽率 (%), Pref, Citycode, Cityname, INDate, FNDate, ValidType (empty in
     the 23 wards), Custodian, INNumber, FNNumber; JGD2011 geographic, UTF-8.
     The 東京都 都市整備局 R070331 file is not used (its dataset page could not
     be read directly).
N03  国土数値情報 行政区域データ 2026年（令和8年）1月1日時点 東京都 — the 23 ward
     polygons PR 4 committed under backend/tests/fixtures/stations/.
時点  A55_R6_datalist.xlsx (the page's 公表自治体及び掲載データ一覧): per
     municipality row, the データ作成年 and データ時点年 columns. The A55 page's
     注意事項 bullet 4 says the 時点 is to be read from this list.

Metric (Architect decisions 2026-11-03)
------------------------------------------------------------------------------
Every area is computed on 平面直角座標系 第IX系 (EPSG:6677, JGD2011) — the
国土地理院 Gauss-Krüger formula below, standard library, checked against pyproj
at extract time. Per ward:
  designated   = Σ over the ward's 用途地域 polygons of area(polygon ∩ N03 ward
                 polygon); the designated share of the ward = designated ÷
                 area(N03 ward polygon), never above 100 by construction;
  share (Z1/D2) = per 用途地域 type, its clipped area ÷ designated; the shares
                 sum to 100;
  Z2           = per type present, the area-weighted mean 指定容積率 / 指定建蔽率
                 (weights: the clipped areas) and the min–max of the polygon values.
The 23区 composition is the same over all wards (an area-weighted sum).
Types keep A55's codes and names; only the types present are displayed.

時点 (way 1): each ward's 用途地域 時点 is the データ時点年 cell of its own row;
a cell that itemises by item number takes the ③ (用途地域) date; 「都に準ずる」
takes the 東京都 row's date; a row with no 用途地域 date gets none, and the
screen says 「時点：国土数値情報の掲載データ一覧に記載なし」.

Licence: 「オープンデータ（CC_BY_4.0）」 under the 国土数値情報 利用規約
(https://nlftp.mlit.go.jp/ksj/other/agreement.html); credit in the 加工 form
with no editor name (Architect decision 12); the page's 【重要：データ利用時の
注意事項】 carried verbatim in the snapshot and shown with the figures.

Run (from the repo root, with -I so nothing in the download dir is imported):

  python -I etl/zoning.py extract
  python -I etl/zoning.py build
  python -I etl/zoning.py verify
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
import sys
import zipfile
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = ROOT / "etl" / "_downloads"
FIXTURES = ROOT / "backend" / "tests" / "fixtures" / "zoning"
N03_FIXTURES = ROOT / "backend" / "tests" / "fixtures" / "stations"
SNAPSHOT = ROOT / "backend" / "data" / "zoning.json"

KSJ_SITE = "https://nlftp.mlit.go.jp/ksj/"
KSJ_TERMS = "https://nlftp.mlit.go.jp/ksj/other/agreement.html"

# --- A55 都市計画決定情報 ------------------------------------------------------------

A55_ID = "A55-24"
A55_EDITION = "2024年度（令和6年度）版"
A55_YEAR = 2024
A55_PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A55-2024.html"
A55_ZIP_URL = "https://nlftp.mlit.go.jp/ksj/gml/data/A55/A55-24/A55-24_13000_SHP.zip"
A55_ZIP = "A55-24_13000_SHP.zip"
A55_DOWNLOAD_DIR = DOWNLOADS / "ksj_A55-24_13"
DATALIST_URL = "https://nlftp.mlit.go.jp/ksj/gml/codelist/A55_R6_datalist.xlsx"
DATALIST = "A55_R6_datalist.xlsx"
DATALIST_SHEET = "公表自治体及び掲載データ一覧"
CODELIST_PDF = "A55_R6_AttributeCodelist.pdf"
LAYER = "youto"

EXCERPT_CSV = "ksj_A55-24_youto_tokyo23.csv"
EXCERPT_GEOJSON = "ksj_A55-24_youto_13101_13123.geojson"
ASOF_TABLE = "a55_datalist_asof_tokyo23.json"
META = "ksj.meta.json"
GEOJSON_WARDS = ("13101", "13123")
EXCERPT_COLUMNS = ["code", "ward", "idx", "youto_code", "youto_name", "far", "bcr", "area_m2", "in_ward_m2", "inside", "vertices"]

# A55_R6_AttributeCodelist p.1 — the 用途地域の種類コード. Every feature's
# YoutoName is checked against this at extract time.
TYPE_NAMES = {
    1: "第１種低層住居専用地域",
    2: "第２種低層住居専用地域",
    3: "第１種中高層住居専用地域",
    4: "第２種中高層住居専用地域",
    5: "第１種住居地域",
    6: "第２種住居地域",
    7: "準住居地域",
    8: "田園住居地域",
    9: "近隣商業地域",
    10: "商業地域",
    11: "準工業地域",
    12: "工業地域",
    13: "工業専用地域",
}
TYPE_CODES = list(TYPE_NAMES)

# --- N03 行政区域 (PR 4's excerpt) -------------------------------------------------

N03_EXCERPT = "ksj_N03-20260101_tokyo23.geojson"
N03_META = "ksj.meta.json"
N03_CODE, N03_NAME = "N03_007", "N03_004"

# The 23 特別区 in 全国地方公共団体コード order (総務省; the same list as
# src/lib/wards.ts and backend/services/demographics.py).
WARD_NAMES = {
    "13101": "千代田区", "13102": "中央区", "13103": "港区", "13104": "新宿区", "13105": "文京区",
    "13106": "台東区", "13107": "墨田区", "13108": "江東区", "13109": "品川区", "13110": "目黒区",
    "13111": "大田区", "13112": "世田谷区", "13113": "渋谷区", "13114": "中野区", "13115": "杉並区",
    "13116": "豊島区", "13117": "北区", "13118": "荒川区", "13119": "板橋区", "13120": "練馬区",
    "13121": "足立区", "13122": "葛飾区", "13123": "江戸川区",
}
WARD_CODES = list(WARD_NAMES)
TOKYO_ROW = "130001"
TOTAL_CODE = "13100"
REGION = "東京23区"

LICENCE = {
    "name": "国土数値情報 利用規約（PDL1.0準拠）— 都市計画決定情報データ・行政区域データはいずれも「オープンデータ（CC_BY_4.0）」",
    "url": KSJ_TERMS,
}
CREDIT = {
    "source": f"出典：国土交通省国土数値情報ダウンロードサイト（{KSJ_SITE}）",
    "edited_a55": f"「国土数値情報（都市計画決定情報データ）」（国土交通省）（{KSJ_SITE}）を加工して作成",
    "edited_n03": f"「国土数値情報（行政区域データ）」（国土交通省）（{KSJ_SITE}）を加工して作成",
    "pages": {"A55": A55_PAGE, "N03": "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html", "datalist": DATALIST_URL},
}
# The A55 page's 【重要：データ利用時の注意事項】, word for word (2026-11-03).
NOTICES = [
    "本データは、建築確認申請や不動産重要事項説明等の手続に用いることを保証するものではなく、参考情報としての利用を想定しています。",
    "本データに含まれる地区・地域の範囲は、概ねの位置を示すものであり、実際の都市計画の決定範囲等と異なる場合があります。",
    "本データは、当該自治体の都市計画等の情報全てではないことがあります。",
    "本データは、最新の情報ではないことがあります。本データの時点については、公表自治体及び掲載データ一覧を参考にしてください。",
    "最新の正確な都市計画決定情報が必要な場合は、該当する地方公共団体の担当課までお問い合わせください。",
    "本データを用いて行う一切の行為（コンテンツを編集・加工等した情報を利用することを含む）及び本データの利用によって発生した直接または間接の損失、損害等について、国土交通省並びに原典資料提供元の地方公共団体は一切の責任を負いません。",
]
NOTES = {
    "share": "各用途地域の面積割合は、区の用途地域指定区域（A55 の用途地域ポリゴンを行政区域データ N03 の区ポリゴンで切り抜いた面積の合計）に対する割合。区ごとに合計 100%",
    "designated": "指定区域の割合 = 用途地域ポリゴン ∩ 区ポリゴン（N03-20260101）の面積 ÷ 区ポリゴンの面積。河川・海面など用途地域の指定がない部分が残りで、100% を超えない",
    "far": "容積率・建蔽率は用途地域ごとの面積加重平均（切り抜いた面積で加重）と、ポリゴンに記録された指定値の範囲（最小〜最大）",
    "asOf": "時点は国土数値情報 公表自治体及び掲載データ一覧（A55_R6_datalist.xlsx）のデータ時点年の列から区ごとに読む。記載のない区は「掲載データ一覧に記載なし」",
    "types": "区分は A55 のコード（1〜13、A55_R6_AttributeCodelist）と名称のまま。面積のある区分のみ表示",
    "area": "面積は平面直角座標系第IX系（EPSG:6677、JGD2011）上で計算",
}
ASOF_MISSING_TEXT = "時点：国土数値情報の掲載データ一覧に記載なし"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


# --- 平面直角座標系 第IX系 (standard library) ------------------------------------------

# 国土地理院's Gauss-Krüger formula (測量計算式, 2011): JGD2011 / GRS80, origin
# 36°N 139°50′E, scale 0.9999 — EPSG:6677. Checked against pyproj at extract
# time (meta.projection_check); the same function serves build and the guards.
_A = 6378137.0
_F = 298.257222101
_M0 = 0.9999
_LAT0 = math.radians(36.0)
_LON0 = math.radians(139.0 + 50.0 / 60.0)
_n = 1.0 / (2.0 * _F - 1.0)
_A0 = 1 + _n**2 / 4 + _n**4 / 64
_Aj = [
    -1.5 * (_n - _n**3 / 8 - _n**5 / 64),
    15.0 / 16 * (_n**2 - _n**4 / 4),
    -35.0 / 48 * (_n**3 - 5 * _n**5 / 16),
    315.0 / 512 * _n**4,
    -693.0 / 1280 * _n**5,
]
_alpha = [
    _n / 2 - 2 * _n**2 / 3 + 5 * _n**3 / 16 + 41 * _n**4 / 180 - 127 * _n**5 / 288,
    13 * _n**2 / 48 - 3 * _n**3 / 5 + 557 * _n**4 / 1440 + 281 * _n**5 / 630,
    61 * _n**3 / 240 - 103 * _n**4 / 140 + 15061 * _n**5 / 26880,
    49561 * _n**4 / 161280 - 179 * _n**5 / 168,
    34729 * _n**5 / 80640,
]
_Abar = _M0 * _A / (1 + _n) * _A0
_Sbar = _M0 * _A / (1 + _n) * (_A0 * _LAT0 + sum(a * math.sin(2 * (j + 1) * _LAT0) for j, a in enumerate(_Aj)))
_two_sqrt_n = 2 * math.sqrt(_n) / (1 + _n)


def tm_project(lon: float, lat: float) -> tuple[float, float]:
    """(lon, lat) in degrees on JGD2011 → (easting, northing) in metres, 第IX系."""
    phi = math.radians(lat)
    lam = math.radians(lon)
    sin_phi = math.sin(phi)
    t = math.sinh(math.atanh(sin_phi) - _two_sqrt_n * math.atanh(_two_sqrt_n * sin_phi))
    tbar = math.sqrt(1 + t * t)
    lc = math.cos(lam - _LON0)
    ls = math.sin(lam - _LON0)
    xi = math.atan2(t, lc)
    eta = math.atanh(ls / tbar)
    x = _Abar * (xi + sum(a * math.sin(2 * (j + 1) * xi) * math.cosh(2 * (j + 1) * eta) for j, a in enumerate(_alpha))) - _Sbar
    y = _Abar * (eta + sum(a * math.cos(2 * (j + 1) * xi) * math.sinh(2 * (j + 1) * eta) for j, a in enumerate(_alpha)))
    return (y, x)


def ring_area(ring: list) -> float:
    """Shoelace area of one projected ring (first point repeated or not)."""
    total = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2.0


def geometry_area(geometry: dict) -> float:
    """Area in m² of a GeoJSON Polygon / MultiPolygon in lon/lat, on 第IX系:
    every exterior ring minus its holes, summed over the parts."""
    if geometry["type"] == "Polygon":
        polygons = [geometry["coordinates"]]
    elif geometry["type"] == "MultiPolygon":
        polygons = geometry["coordinates"]
    else:
        raise ValueError(f"not a polygon geometry: {geometry['type']}")
    total = 0.0
    for rings in polygons:
        projected = [[tm_project(lon, lat) for lon, lat in ring] for ring in rings]
        total += ring_area(projected[0]) - sum(ring_area(r) for r in projected[1:])
    return total


def vertex_count(geometry: dict) -> int:
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    return sum(len(ring) for rings in polygons for ring in rings)


def ward_areas(n03_fixtures: Path = N03_FIXTURES) -> dict[str, float]:
    """The 23 N03 ward polygons' areas (m², 第IX系) from PR 4's committed excerpt."""
    gj = _load(n03_fixtures / N03_EXCERPT)
    areas: dict[str, float] = {code: 0.0 for code in WARD_CODES}
    for f in gj["features"]:
        code = f["properties"].get(N03_CODE)
        if code in areas:
            areas[code] += geometry_area(f["geometry"])
    missing = [c for c, a in areas.items() if a <= 0]
    if missing:
        raise ValueError(f"N03 excerpt has no polygon for {missing}")
    return areas


# --- the 時点 table ------------------------------------------------------------------

_REIWA = re.compile(r"R(\d+)\.(\d{1,2})\.(\d{1,2})")


def _cell_text(value) -> str | None:
    """A cell quoted as it stands: ISO date for a date cell, the text otherwise."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    return str(value)


def _reiwa_to_date(token: str) -> str | None:
    m = _REIWA.search(token)
    if not m:
        return None
    year, month, day = int(m.group(1)) + 2018, int(m.group(2)), int(m.group(3))
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def asof_for_ward(cell, tokyo_date: str | None) -> tuple[str | None, str, str | None]:
    """(date or None, basis, note) for one ward row's データ時点年 cell.

    basis: asof_cell (a date cell), asof_itemised (the ③ 用途地域 entry of a
    cell that itemises by item number), tokyo_row (「都に準ずる」), none."""
    if isinstance(cell, datetime):
        return cell.date().isoformat(), "asof_cell", None
    text = (str(cell) if cell is not None else "").strip()
    if text == "都に準ずる":
        return tokyo_date, "tokyo_row", "都に準ずる"
    if "③" in text:
        for segment in re.split(r"\s+", text):
            if "③" in segment:
                parsed = _reiwa_to_date(segment)
                if parsed:
                    return parsed, "asof_itemised", "③（用途地域）の日付"
    return None, "none", None


def ja_date(iso: str) -> str:
    y, m, d = (int(p) for p in iso.split("-"))
    return f"{y}年{m}月{d}日"


def asof_display(entry: dict) -> tuple[str, str]:
    """(label, text) for one ward: 「2024年3月26日」 / 「時点：2024年3月26日」, the
    「都に準ずる」 note appended, or the 記載なし sentence when there is no date."""
    if entry["date"] is None:
        return "国土数値情報の掲載データ一覧に記載なし", ASOF_MISSING_TEXT
    label = ja_date(entry["date"])
    if entry.get("basis") == "tokyo_row":
        label = f"{label}（都に準ずる）"
    return label, f"時点：{label}"


def asof_total(entries: list[dict]) -> dict:
    """The 23区 view: the range of the dated wards and the count without a date."""
    dated = sorted(e["date"] for e in entries if e["date"])
    missing = [e["code"] for e in entries if e["date"] is None]
    label = f"{ja_date(dated[0])}〜{ja_date(dated[-1])}"
    if missing:
        label += f"（{len(missing)}区は掲載データ一覧に記載なし）"
    return {"date": None, "from": dated[0], "to": dated[-1], "missing": missing, "label": label, "text": f"時点：{label}"}


def extract_asof(xlsx: Path) -> dict:
    import openpyxl  # etl/requirements.txt

    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    if DATALIST_SHEET not in wb.sheetnames:
        raise ValueError(f"{xlsx.name}: no sheet {DATALIST_SHEET!r}")
    rows = list(wb[DATALIST_SHEET].iter_rows(values_only=True))
    header = rows[2]
    col = {name: i for i, name in enumerate(header) if isinstance(name, str)}
    code_col = col["団体コード"]
    created_col, asof_col, notes_col = col["データ作成年"], col["データ時点年"], col["留意事項"]
    layer_col = col["用途地域"]
    by_code = {str(r[code_col]): r for r in rows[3:] if r[code_col]}
    tokyo = by_code[TOKYO_ROW]
    tokyo_date = tokyo[asof_col].date().isoformat() if isinstance(tokyo[asof_col], datetime) else None
    wards = []
    for code, name in WARD_NAMES.items():
        matches = [rc for rc in by_code if rc.startswith(code) and len(rc) == 6]
        if len(matches) != 1:
            raise ValueError(f"{name}: {len(matches)} rows for {code} in the data list")
        row = by_code[matches[0]]
        if row[layer_col] != "〇":
            raise ValueError(f"{name}: 用途地域 column reads {row[layer_col]!r}, not 〇")
        d, basis, note = asof_for_ward(row[asof_col], tokyo_date)
        entry = {
            "code": code,
            "name": name,
            "rowCode": matches[0],
            "cells": {"created": _cell_text(row[created_col]), "asOf": _cell_text(row[asof_col]), "notes": _cell_text(row[notes_col])},
            "date": d,
            "basis": basis,
        }
        if note:
            entry["note"] = note
        wards.append(entry)
    return {
        "source": {
            "title": "国土数値情報 都市計画決定情報 公表自治体及び掲載データ一覧（A55 2024年度版）",
            "url": DATALIST_URL,
            "file": DATALIST,
            "bytes": xlsx.stat().st_size,
            "sha256": sha256(xlsx),
            "sheet": DATALIST_SHEET,
            "columns": {"code": "団体コード", "layer": "用途地域", "created": "データ作成年", "asOf": "データ時点年", "notes": "留意事項"},
            "legend": str(rows[1][1]).replace("\n", " "),
            "rule": (
                "the ward's own row decides (A55 page 注意事項 4: 本データの時点については、公表自治体及び掲載データ一覧を参考にしてください); "
                "a date cell is the date; a cell that itemises by item number takes ③ (用途地域); "
                "「都に準ずる」 takes the 東京都 row (130001); anything else is no date (Architect decision 2026-11-03, way 1)"
            ),
        },
        "tokyo": {"rowCode": TOKYO_ROW, "created": _cell_text(tokyo[created_col]), "asOf": _cell_text(tokyo[asof_col]), "date": tokyo_date},
        "wards": wards,
    }


# --- extract ------------------------------------------------------------------------


def _int_attr(value, what: str, where: str) -> int:
    s = str(value).strip()
    if not re.fullmatch(r"\d+", s):
        raise ValueError(f"{where}: {what} {value!r} is not an integer")
    return int(s)


def _round_coords(geom):
    from shapely.ops import transform

    return transform(lambda x, y, z=None: (round(x, 9), round(y, 9)), geom)


def extract(out_dir: Path = FIXTURES, today: date | None = None) -> None:
    import shapefile  # pyshp
    from shapely.geometry import mapping, shape
    from shapely.ops import transform

    zip_path = A55_DOWNLOAD_DIR / A55_ZIP
    xlsx = A55_DOWNLOAD_DIR / DATALIST
    n03_meta = _load(N03_FIXTURES / N03_META)["N03"]
    n03_geojson = _load(N03_FIXTURES / N03_EXCERPT)
    areas = ward_areas()
    ward_polys: dict[str, object] = {}
    for f in n03_geojson["features"]:
        code = f["properties"].get(N03_CODE)
        if code in WARD_NAMES:
            g = shape(f["geometry"])
            ward_polys[code] = g if code not in ward_polys else ward_polys[code].union(g)
    ward_projected = {c: transform(lambda x, y, z=None: tm_project(x, y), g) for c, g in ward_polys.items()}
    for code, g in ward_projected.items():
        if abs(g.area - areas[code]) > 1e-3:
            raise ValueError(f"{code}: shapely area {g.area} != shoelace {areas[code]}")

    rows: list[dict] = []
    features: list[dict] = []
    per_ward: dict[str, dict] = {}
    sample_points: list[tuple[float, float]] = []
    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
        for code, name in WARD_NAMES.items():
            base = f"A55-24_13000_SHP/A55-24_{code}_SHP/{code}_{LAYER}"
            for ext in (".shp", ".shx", ".dbf", ".prj", ".cpg"):
                if base + ext not in names:
                    raise ValueError(f"{name}: {base + ext} is missing from the archive")
            prj = zf.read(base + ".prj").decode("ascii", "replace")
            if not prj.startswith("GEOGCS[") or "JGD_2011" not in prj:
                raise ValueError(f"{name}: the CRS is not JGD2011 geographic ({prj[:60]}…)")
            if zf.read(base + ".cpg").decode("ascii", "replace").strip().upper() != "UTF-8":
                raise ValueError(f"{name}: the .cpg does not say UTF-8")
            reader = shapefile.Reader(
                shp=io.BytesIO(zf.read(base + ".shp")),
                shx=io.BytesIO(zf.read(base + ".shx")),
                dbf=io.BytesIO(zf.read(base + ".dbf")),
                encoding="utf-8",
            )
            if reader.shapeType != shapefile.POLYGON:
                raise ValueError(f"{name}: shape type {reader.shapeTypeName}, not POLYGON")
            fields = [f[0] for f in reader.fields[1:]]
            for needed in ("YoutoName", "YoutoCode", "FAR", "BCR", "Citycode", "ValidType"):
                if needed not in fields:
                    raise ValueError(f"{name}: field {needed} missing")
            count = 0
            ward_pg = ward_projected[code]
            for idx, sr in enumerate(reader.iterShapeRecords()):
                where = f"{code}#{idx}"
                rec = dict(zip(fields, list(sr.record), strict=True))
                if str(rec["Citycode"]).strip() != code:
                    raise ValueError(f"{where}: Citycode {rec['Citycode']!r} is not {code}")
                if str(rec["ValidType"]).strip():
                    raise ValueError(f"{where}: ValidType {rec['ValidType']!r} (expected empty; 廃止 would be excluded)")
                youto = _int_attr(rec["YoutoCode"], "YoutoCode", where)
                if youto not in TYPE_NAMES:
                    raise ValueError(f"{where}: YoutoCode {youto} is not one of 1–13")
                if str(rec["YoutoName"]).strip() != TYPE_NAMES[youto]:
                    raise ValueError(f"{where}: YoutoName {rec['YoutoName']!r} != codelist {TYPE_NAMES[youto]!r}")
                far = _int_attr(rec["FAR"], "FAR", where)
                bcr = _int_attr(rec["BCR"], "BCR", where)
                if far <= 0 or not 0 < bcr <= 100:
                    raise ValueError(f"{where}: FAR {far} / BCR {bcr} out of range")
                if sr.shape.shapeType == shapefile.NULL or not sr.shape.points:
                    raise ValueError(f"{where}: null shape")
                geom = _round_coords(shape(sr.shape.__geo_interface__))
                if not geom.is_valid or geom.is_empty:
                    raise ValueError(f"{where}: invalid or empty geometry after rounding")
                geometry = mapping(geom)
                area = geometry_area(geometry)
                projected = transform(lambda x, y, z=None: tm_project(x, y), geom)
                if abs(projected.area - area) > 1e-3:
                    raise ValueError(f"{where}: shapely area {projected.area} != shoelace {area}")
                inside = ward_pg.covers(projected)
                in_ward = area if inside else projected.intersection(ward_pg).area
                if in_ward > area + 1e-6:
                    raise ValueError(f"{where}: clipped area {in_ward} > area {area}")
                rows.append(
                    {
                        "code": code,
                        "ward": name,
                        "idx": idx,
                        "youto_code": youto,
                        "youto_name": TYPE_NAMES[youto],
                        "far": far,
                        "bcr": bcr,
                        "area_m2": f"{area:.3f}",
                        "in_ward_m2": f"{in_ward:.3f}",
                        "inside": 1 if inside else 0,
                        "vertices": vertex_count(geometry),
                    }
                )
                if code in GEOJSON_WARDS:
                    features.append(
                        {
                            "type": "Feature",
                            "properties": {"code": code, "ward": name, "idx": idx, "youto_code": youto, "youto_name": TYPE_NAMES[youto], "far": far, "bcr": bcr},
                            "geometry": json.loads(json.dumps(geometry)),
                        }
                    )
                if idx < 3:
                    sample_points.extend(sr.shape.points[:200])
                count += 1
            per_ward[code] = {"polygons": count}

    projection_check = None
    try:
        from pyproj import Transformer

        t = Transformer.from_crs("EPSG:6668", "EPSG:6677", always_xy=True)
        worst = 0.0
        for lon, lat in sample_points:
            ex, ny = t.transform(lon, lat)
            x, y = tm_project(lon, lat)
            worst = max(worst, abs(ex - x), abs(ny - y))
        if worst > 1e-3:
            raise ValueError(f"stdlib projection differs from pyproj by {worst} m")
        projection_check = {"against": "pyproj EPSG:6668→EPSG:6677", "points": len(sample_points), "max_abs_diff_m": worst}
    except ImportError:
        projection_check = {"against": "pyproj not installed — not checked", "points": 0, "max_abs_diff_m": None}

    out_dir.mkdir(parents=True, exist_ok=True)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=EXCERPT_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    (out_dir / EXCERPT_CSV).write_text(buf.getvalue(), encoding="utf-8")
    (out_dir / EXCERPT_GEOJSON).write_text(
        json.dumps(
            {"type": "FeatureCollection", "name": f"A55-24 東京都 用途地域 (youto) {' '.join(WARD_NAMES[c] for c in GEOJSON_WARDS)}", "features": features},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    asof = extract_asof(xlsx)
    (out_dir / ASOF_TABLE).write_text(json.dumps(asof, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    meta = {
        "fetched": (today or date.today()).isoformat(),
        "A55": {
            "id": A55_ID,
            "title": "国土数値情報 都市計画決定情報データ（東京都）",
            "edition": A55_EDITION,
            "year": A55_YEAR,
            "page": A55_PAGE,
            "url": A55_ZIP_URL,
            "file": A55_ZIP,
            "bytes": zip_path.stat().st_size,
            "sha256": sha256(zip_path),
            "published": "2025-11（更新履歴「2025年11月：2024年度（令和6年度）版に更新しました。」）",
            "licence": "オープンデータ（CC_BY_4.0）",
            "layer": f"<city>_{LAYER}.shp (用途地域) of each ward folder A55-24_131xx_SHP; JGD2011 geographic, UTF-8",
            "codelist": CODELIST_PDF,
            "types": {str(k): v for k, v in TYPE_NAMES.items()},
            "wards": per_ward,
            "rows_kept": len(rows),
            "cut": (
                "one CSV row per 用途地域 polygon of the 23 ward folders: code (Citycode), ward, idx (feature index in the ward's youto layer), "
                "youto_code (YoutoCode), youto_name (YoutoName), far (FAR, %), bcr (BCR, %), area_m2 (the polygon's area on 第IX系, coordinates "
                "rounded to 9 decimals), in_ward_m2 (area of polygon ∩ the N03 ward polygon; equal to area_m2 when inside = 1), inside "
                "(1 when the N03 polygon covers the whole polygon), vertices. The GeoJSON carries the geometry of the 13101 and 13123 layers "
                "with the same rounding."
            ),
            "notices": NOTICES,
        },
        "datalist": asof["source"],
        "N03": {
            "id": n03_meta["id"],
            "edition": n03_meta["edition"],
            "page": n03_meta["page"],
            "url": n03_meta["url"],
            "file": n03_meta["file"],
            "bytes": n03_meta["bytes"],
            "sha256": n03_meta["sha256"],
            "excerpt": f"backend/tests/fixtures/stations/{N03_EXCERPT}",
            "excerpt_sha256": sha256(N03_FIXTURES / N03_EXCERPT),
            "ward_area_m2": {code: f"{areas[code]:.3f}" for code in WARD_CODES},
        },
        "projection": {
            "crs": "EPSG:6677 平面直角座標系第IX系（JGD2011）",
            "method": "国土地理院 Gauss-Krüger series (etl/zoning.py tm_project), standard library; areas by the shoelace formula",
            "check": projection_check,
        },
    }
    (out_dir / META).write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {out_dir / EXCERPT_CSV} ({len(rows)} polygons), {out_dir / EXCERPT_GEOJSON} ({len(features)} features), {out_dir / ASOF_TABLE}, {out_dir / META}")
    print(f"projection check: {projection_check}")


# --- build --------------------------------------------------------------------------


def read_excerpt(fixtures: Path = FIXTURES) -> list[dict]:
    rows = list(csv.DictReader((fixtures / EXCERPT_CSV).read_text(encoding="utf-8").splitlines()))
    out = []
    for r in rows:
        out.append(
            {
                "code": r["code"],
                "ward": r["ward"],
                "idx": int(r["idx"]),
                "youto_code": int(r["youto_code"]),
                "youto_name": r["youto_name"],
                "far": int(r["far"]),
                "bcr": int(r["bcr"]),
                "area_m2": float(r["area_m2"]),
                "in_ward_m2": float(r["in_ward_m2"]),
                "inside": int(r["inside"]),
                "vertices": int(r["vertices"]),
            }
        )
    return out


def _figures(values: list[tuple[float, int]]) -> dict:
    """Area-weighted mean and min–max of one attribute over (weight, value) pairs."""
    weight = sum(w for w, _ in values)
    mean = sum(w * v for w, v in values) / weight if weight else None
    return {"mean": round(mean, 1) if mean is not None else None, "min": min(v for _, v in values), "max": max(v for _, v in values)}


def composition(code: str, name: str, rows: list[dict], ward_m2: float, as_of: dict) -> dict:
    """One ward's (or the 23区) composition from its polygon rows."""
    designated = sum(r["in_ward_m2"] for r in rows)
    if designated <= 0:
        raise ValueError(f"{name}: no designated area")
    share_of_ward = designated / ward_m2 * 100
    if share_of_ward > 100 + 1e-9:
        raise ValueError(f"{name}: designated {designated} exceeds the ward polygon {ward_m2}")
    types = []
    for t in TYPE_CODES:
        mine = [r for r in rows if r["youto_code"] == t and r["in_ward_m2"] > 0]
        if not mine:
            continue
        m2 = sum(r["in_ward_m2"] for r in mine)
        types.append(
            {
                "code": t,
                "name": TYPE_NAMES[t],
                "m2": round(m2, 3),
                "share": round(m2 / designated * 100, 4),
                "n": len(mine),
                "far": _figures([(r["in_ward_m2"], r["far"]) for r in mine]),
                "bcr": _figures([(r["in_ward_m2"], r["bcr"]) for r in mine]),
            }
        )
    total_share = sum(t["share"] for t in types)
    if abs(total_share - 100) > 0.5:
        raise ValueError(f"{name}: shares sum to {total_share}")
    return {
        "code": code,
        "name": name,
        "wardM2": round(ward_m2, 3),
        "designatedM2": round(designated, 3),
        "designatedShare": round(share_of_ward, 2),
        "outsideM2": round(sum(r["area_m2"] - r["in_ward_m2"] for r in rows), 3),
        "polygons": len(rows),
        "asOf": as_of,
        "types": types,
    }


def build(fixtures: Path = FIXTURES, n03_fixtures: Path = N03_FIXTURES) -> dict:
    meta = _load(fixtures / META)
    asof = _load(fixtures / ASOF_TABLE)
    rows = read_excerpt(fixtures)
    areas = ward_areas(n03_fixtures)
    for code in WARD_CODES:
        recorded = meta["N03"]["ward_area_m2"].get(code)
        if recorded is None or abs(float(recorded) - areas[code]) > 1e-3:
            raise ValueError(f"{code}: N03 ward area {areas[code]} != meta {recorded}")
    if any(r["youto_code"] not in TYPE_NAMES for r in rows):
        raise ValueError("a row carries a YoutoCode outside 1–13")
    if any(r["youto_name"] != TYPE_NAMES[r["youto_code"]] for r in rows):
        raise ValueError("a row's YoutoName disagrees with the codelist")

    asof_by_code = {e["code"]: e for e in asof["wards"]}
    wards = []
    for code, name in WARD_NAMES.items():
        mine = [r for r in rows if r["code"] == code]
        if not mine:
            raise ValueError(f"{name}: no polygon")
        if len(mine) != meta["A55"]["wards"][code]["polygons"]:
            raise ValueError(f"{name}: {len(mine)} rows, meta says {meta['A55']['wards'][code]['polygons']}")
        entry = asof_by_code[code]
        label, text = asof_display(entry)
        as_of = {"date": entry["date"], "basis": entry["basis"], "label": label, "text": text, "cells": entry["cells"]}
        if entry.get("note"):
            as_of["note"] = entry["note"]
        wards.append(composition(code, name, mine, areas[code], as_of))
    total = composition(TOTAL_CODE, REGION, rows, sum(areas.values()), asof_total(asof["wards"]))

    a55 = meta["A55"]
    return {
        "region": REGION,
        "year": a55["year"],
        "edition": a55["edition"],
        "sources": {
            "zoning": {
                "year": a55["year"],
                "table": a55["id"],
                "label": f"国土数値情報 都市計画決定情報データ {a55['edition']} 用途地域（東京都、各区の用途地域レイヤ）",
            },
            "wards": {
                "year": int(meta["N03"]["id"][4:8]),
                "table": meta["N03"]["id"],
                "label": f"国土数値情報 行政区域データ {meta['N03']['edition']} 東京都（区の面積と指定区域の切り抜き）",
            },
            "asOf": {
                "year": a55["year"],
                "table": DATALIST,
                "label": "国土数値情報 都市計画決定情報 公表自治体及び掲載データ一覧（A55_R6_datalist.xlsx）データ時点年",
            },
        },
        "inputs": {
            EXCERPT_CSV: {"path": f"backend/tests/fixtures/zoning/{EXCERPT_CSV}", "sha256": sha256(fixtures / EXCERPT_CSV), "cut_from": {k: a55[k] for k in ("id", "title", "edition", "year", "page", "url", "file", "bytes", "sha256", "published", "licence", "layer", "rows_kept", "cut")}},
            EXCERPT_GEOJSON: {"path": f"backend/tests/fixtures/zoning/{EXCERPT_GEOJSON}", "sha256": sha256(fixtures / EXCERPT_GEOJSON), "wards": list(GEOJSON_WARDS)},
            ASOF_TABLE: {"path": f"backend/tests/fixtures/zoning/{ASOF_TABLE}", "sha256": sha256(fixtures / ASOF_TABLE), "derived_from": asof["source"]},
            N03_EXCERPT: {"path": meta["N03"]["excerpt"], "sha256": meta["N03"]["excerpt_sha256"], "cut_from": {k: meta["N03"][k] for k in ("id", "edition", "page", "url", "file", "bytes", "sha256")}},
        },
        "projection": meta["projection"],
        "licence": LICENCE,
        "credit": CREDIT,
        "notices": list(NOTICES),
        "notes": NOTES,
        "types": [{"code": c, "name": n} for c, n in TYPE_NAMES.items()],
        "total": total,
        "wards": wards,
    }


# --- verify -------------------------------------------------------------------------


def verify(fixtures: Path = FIXTURES) -> list[str]:
    """Re-derive the committed wards' polygon areas from the GeoJSON (standard
    library) and compare with the CSV. Returns the mismatches."""
    gj = _load(fixtures / EXCERPT_GEOJSON)
    by_key = {(r["code"], r["idx"]): r for r in read_excerpt(fixtures)}
    problems = []
    seen = 0
    for f in gj["features"]:
        p = f["properties"]
        row = by_key.get((p["code"], p["idx"]))
        if row is None:
            problems.append(f"{p['code']}#{p['idx']}: not in the CSV")
            continue
        seen += 1
        area = f"{geometry_area(f['geometry']):.3f}"
        if area != f"{row['area_m2']:.3f}":
            problems.append(f"{p['code']}#{p['idx']}: GeoJSON area {area} != CSV {row['area_m2']:.3f}")
        if (p["youto_code"], p["far"], p["bcr"]) != (row["youto_code"], row["far"], row["bcr"]):
            problems.append(f"{p['code']}#{p['idx']}: attributes differ")
        if row["inside"] == 1 and row["in_ward_m2"] != row["area_m2"]:
            problems.append(f"{p['code']}#{p['idx']}: inside but in_ward_m2 != area_m2")
    for code in GEOJSON_WARDS:
        n_csv = sum(1 for k in by_key if k[0] == code)
        n_gj = sum(1 for f in gj["features"] if f["properties"]["code"] == code)
        if n_csv != n_gj:
            problems.append(f"{code}: {n_gj} GeoJSON features, {n_csv} CSV rows")
    return problems


def main(argv: list[str]) -> int:
    if argv[1:] == ["extract"]:
        extract()
    elif argv[1:] == ["build"]:
        snapshot = build()
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        t = snapshot["total"]
        print(
            f"wrote {SNAPSHOT} ({t['polygons']} polygons in {len(snapshot['wards'])} wards; 23区 designated "
            f"{t['designatedM2'] / 1e6:.2f} km² = {t['designatedShare']} % of {t['wardM2'] / 1e6:.2f} km²; {t['asOf']['text']})"
        )
    elif argv[1:] == ["verify"]:
        problems = verify()
        print("\n".join(problems) if problems else "verify: the GeoJSON re-derives the CSV for 13101 and 13123")
        return 1 if problems else 0
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
