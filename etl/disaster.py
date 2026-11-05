"""災害 snapshot for the 23 特別区 (real-data plan PR 7, RECON 2026-10-uo-real-data §9 row 7).

Four steps, nothing typed by hand:

  extract   the raw files (git-ignored downloads under etl/_downloads/) + the
            committed N03 ward polygons of PR 4 → committed excerpts under
            backend/tests/fixtures/disaster/:
              - the 東京都 地域危険度 第9回 CSV, whole (all2.csv, cp932, as published);
              - 洪水 (A31a-25 想定最大規模) and 高潮 (A49-20): per ward and depth
                class, the area of the ward polygon inside that class, where
                overlapping polygons (several rivers) are resolved by the
                deepest class — one CSV row per (ward, class);
              - the same resolved class geometry of one guard ward per hazard
                (the smallest file covering ≥ 2 classes), as GeoJSON — the
                guards re-derive that ward's rows from it with the standard
                library;
              - 土砂 (A33-25): one CSV row per (zone polygon, ward) the polygon
                reaches, with its 区域番号, 現象, 区分 and the area inside the ward;
              - 津波 (A40-23): the file's extent and per-ward hit counts, with the
                documents that say why the 23 wards have no 津波浸水想定;
              - a sidecar meta with every raw file's URL, size and sha256.
            Needs shapely (etl/requirements.txt).
  build     committed excerpts → backend/data/disaster_risks.json, the snapshot
            /api/v1/disaster-risks serves. Standard library only, so the drift
            test re-runs it in CI.
  hero      backend/data/land_prices.json + backend/data/disaster_risks.json →
            src/data/hero-spread.json, the LP hero's six rows (public page, so
            a static file, not a gated route). Standard library only.
  verify    re-derives the guard wards' 洪水 and 高潮 class areas from the
            committed GeoJSON with the standard library and compares them with
            the CSVs.

Sources (Architect decisions 1, 8, 11 and sub-decisions, 2026-11-05)
------------------------------------------------------------------------------
地震  東京都「地震に関する地域危険度測定調査（第9回）」（令和4年9月公表）, 町丁目別
     危険度一覧 all2.csv (東京都都市整備局). Per 町丁目 the 建物倒壊危険度,
     火災危険度 and 総合危険度 ranks 1–5 — a relative evaluation among the 都's
     5,192 町丁目 (市街化区域). The CSV's fourth measure, 災害時活動困難度, has a
     困難係数 and no rank. J-SHIS is not used.
洪水  国土数値情報 洪水浸水想定区域データ（河川単位）A31a-25, 2025年度（令和7年度）版,
     想定最大規模: the 東京都 zips (_13_10 洪水予報河川・水位周知河川, _13_20 その他の
     河川) and the 関東地方整備局 zip (_83_10, 国管理河川: 荒川・江戸川・綾瀬川・
     多摩川・利根川 …). 浸水深ランク 1–6 (water_depth_code.xlsx).
土砂  国土数値情報 土砂災害警戒区域データ A33-25, 2025年度（令和7年度）版, 東京都
     (「本データは2025年7月30日時点の整備です。」). 現象 1 急傾斜地の崩壊 / 2 土石流 /
     3 地滑り; 区域区分 1 土砂災害警戒区域 / 2 土砂災害特別警戒区域 (指定済).
津波  国土数値情報 津波浸水想定データ A40-23, 東京都: every polygon is in the
     伊豆・小笠原諸島; none reaches the 23 wards. 東京都's 津波浸水想定 (津波防災
     地域づくり法 第8条第1項) was set for the 島しょ部 only — the 都's 解説 and
     国土交通省's 令和5年7月28日 paper (「東京都の区部を除いて設定済み」) — so
     the wards are 対象外 on that basis, not 0 %.
高潮  国土数値情報 高潮浸水想定区域データ A49-20, 2020年度（令和2年度）版, 東京都
     (想定最大規模). 7 depth classes as the file labels them.
N03  国土数値情報 行政区域データ 2026年（令和8年）1月1日時点 — PR 4's committed
     ward polygons; every share's denominator is the N03 polygon's area.

Areas: 平面直角座標系 第IX系 (EPSG:6677) by etl/zoning.py's standard-library
Gauss-Krüger formula and the shoelace formula, measured on geometry rounded to
9 decimals of a degree. The geometry operations of extract (union,
difference, intersection) run on JGD2011 lon/lat with shapely.

Run (from the repo root, with -I so nothing in the download dir is imported):

  python -I etl/disaster.py extract
  python -I etl/disaster.py build
  python -I etl/disaster.py hero
  python -I etl/disaster.py verify
"""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import io
import json
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = ROOT / "etl" / "_downloads"
FIXTURES = ROOT / "backend" / "tests" / "fixtures" / "disaster"
N03_FIXTURES = ROOT / "backend" / "tests" / "fixtures" / "stations"
SNAPSHOT = ROOT / "backend" / "data" / "disaster_risks.json"
LAND_PRICES = ROOT / "backend" / "data" / "land_prices.json"
HERO = ROOT / "src" / "data" / "hero-spread.json"


def _zoning():
    """etl/zoning.py's projection, shoelace and N03 helpers — one formula for every snapshot."""
    spec = importlib.util.spec_from_file_location("zoning_etl_for_disaster", Path(__file__).with_name("zoning.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


Z = _zoning()
geometry_area = Z.geometry_area
ward_areas = Z.ward_areas
WARD_NAMES = Z.WARD_NAMES
WARD_CODES = Z.WARD_CODES
N03_EXCERPT = Z.N03_EXCERPT
N03_META = Z.N03_META
N03_CODE = Z.N03_CODE
TOTAL_CODE = "13100"
REGION = "東京23区"
# The guard geometry: per hazard, the ward whose resolved class geometry is the
# smallest file while still covering at least two classes, so the committed
# excerpts stay near 2 MB; extract records the choice in the meta.
GEOJSON_MIN_CLASSES = 2

KSJ_SITE = "https://nlftp.mlit.go.jp/ksj/"
KSJ_TERMS = "https://nlftp.mlit.go.jp/ksj/other/agreement.html"
KSJ_DATA = "https://nlftp.mlit.go.jp/ksj/gml/data"

# --- 地震: 東京都 地域危険度 第9回 ----------------------------------------------------

KIKENDO_URL = "https://www.toshiseibi.metro.tokyo.lg.jp/bosai/chousa_6/download/all2.csv"
KIKENDO_SERVED_AT = "https://www.toshiseibi.metro.tokyo.lg.jp/documents/d/toshiseibi/csv_bosai_chousa_6_download_all2"
KIKENDO_FILE = "all2.csv"
KIKENDO_SHA256 = "62ad9f4479f43ea254ed89bdfbc289ee9ccf7f18546a3713c29e6d63bbabbfb9"
KIKENDO_EXCERPT = "tokyo_kikendo9_all2.csv"
KIKENDO_DOWNLOAD_DIR = DOWNLOADS / "tokyo_kikendo9"
KIKENDO_TITLE = "地震に関する地域危険度測定調査（第9回）地域危険度一覧（令和4年9月公表）"
KIKENDO_SHORT = "東京都 地域危険度 第9回（2022年）"
KIKENDO_CATALOG = "https://catalog.data.metro.tokyo.lg.jp/dataset/t000008d0000000012"
KIKENDO_API_PAGE = "https://spec.api.metro.tokyo.lg.jp/spec/t000008d0000000012-5611a503ba1c2785d49d69234d168148-0?lang=ja"
KIKENDO_PRESS = "https://www.toshiseibi.metro.tokyo.lg.jp/information/press/r4/09/2022090901"
TOKYO_OD_TERMS = "https://portal.data.metro.tokyo.lg.jp/terms/"
TOKYO_SITE_POLICY = "https://www.toshiseibi.metro.tokyo.lg.jp/policy"
CC_BY_JA = "https://creativecommons.org/licenses/by/4.0/deed.ja"
KIKENDO_COLUMNS = [
    "区市町名", "町丁目名", "地盤分類",
    "建物倒壊危険度危険量（棟/ha）", "建物倒壊危険度順位", "建物倒壊危険度ランク",
    "火災危険度危険量（棟/ha）", "火災危険度順位", "火災危険度ランク",
    "災害時活動困難度困難係数",
    "総合危険度危険量（棟/ha）", "総合危険度順位", "総合危険度ランク",
]
# The three ranked measures, in the order the survey lists them; 災害時活動困難度
# carries a 困難係数 only (no rank column), so it is not a rank row here.
KINDS = [
    ("total", "総合危険度", "総合危険度ランク"),
    ("building", "建物倒壊危険度", "建物倒壊危険度ランク"),
    ("fire", "火災危険度", "火災危険度ランク"),
]
RANKS = [1, 2, 3, 4, 5]
KIKENDO_ALL_ROWS = 5192
RELATIVE_NOTE = "ランクは都内の町丁目（市街化区域の5,192町丁目）の中での相対評価（ランク1〜5、5が最も危険度が高い）"

# --- 洪水: A31a-25 ---------------------------------------------------------------------

A31_ID = "A31a-25"
A31_EDITION = "2025年度（令和7年度）版"
A31_YEAR = 2025
A31_PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A31a-2025.html"
A31_DOWNLOAD_DIR = DOWNLOADS / "ksj_A31a-25"
A31_ZIPS = [
    ("A31a-25_13_10_GEOJSON.zip", "ecef23e95ac75554bfd42e6156800291b7af27bca49198002eab6f0394fe9f93", "東京都 洪水予報河川・水位周知河川"),
    ("A31a-25_13_20_GEOJSON.zip", "3101bac42ebb9693f7c9f92d994b7eb60a2cfe2bf2659a21dfb2a0886885e0b4", "東京都 その他の河川"),
    ("A31a-25_83_10_GEOJSON.zip", "e66542cecda1c2ed9e7cf74d3333512a65bdb334557410389e521e7c259bca35", "関東地方整備局 洪水予報河川・水位周知河川（国管理河川）"),
]
A31_MEMBER_DIR = "20_想定最大規模"
A31_RANK = "A31a_205"
# water_depth_code.xlsx (浸水ランクコード), the page's codelist.
FLOOD_CLASSES = [
    (1, "0.5m未満"),
    (2, "0.5m以上3.0m未満"),
    (3, "3.0m以上5.0m未満"),
    (4, "5.0m以上10.0m未満"),
    (5, "10.0m以上20.0m未満"),
    (6, "20.0m以上"),
]
FLOOD_CODELIST = "https://nlftp.mlit.go.jp/ksj/gml/codelist/water_depth_code.xlsx"
FLOOD_CODELIST_SHA256 = "6d2d0ea50cdf5909b9729d92d18139c4f054e6384c5929f1b74694aef37ba700"
FLOOD_DEEP_FROM = 3  # 浸水深 3 m 以上 = ランク 3 以上 (the hero's 洪水 figure)
FLOOD_EXCERPT = "ksj_A31a-25_L2_tokyo23.csv"
FLOOD_GEOJSON = "ksj_A31a-25_L2_guard.geojson"

# --- 土砂: A33-25 ----------------------------------------------------------------------

A33_ID = "A33-25"
A33_EDITION = "2025年度（令和7年度）版"
A33_YEAR = 2025
A33_PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A33-2025.html"
A33_DOWNLOAD_DIR = DOWNLOADS / "ksj_A33-25_13"
A33_ZIP = "A33-25_13_GEOJSON.zip"
A33_SHA256 = "4107d815b48fd3a4e9d5394ff4c8504f9f54924293bb021c5f51b6ea3f2ee847"
A33_MEMBER = "A33-25_13Polygon.geojson"
A33_NOTICE_MEMBER = "データ利用時の注意事項\\13_東京都_データ利用時の注意事項.txt"
A33_TOKYO_ASOF = "2025-07-30"
PHENOMENA = {1: "急傾斜地の崩壊", 2: "土石流", 3: "地滑り"}
ZONES = {1: "土砂災害警戒区域", 2: "土砂災害特別警戒区域"}
LANDSLIDE_EXCERPT = "ksj_A33-25_tokyo23.csv"

# --- 津波: A40-23 ----------------------------------------------------------------------

A40_ID = "A40-23"
A40_PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A40-2024.html"
A40_DOWNLOAD_DIR = DOWNLOADS / "ksj_A40-23_13"
A40_ZIP = "A40-23_13_GML.zip"
A40_SHA256 = "b8e24973e5f9b885d481c28211f107587d14597cb3d9674d26c1aa591dacdc5c"
A40_MEMBER = "A40-23_13_GML/A40-23_13.geojson"
TSUNAMI_EXCERPT = "ksj_A40-23_tokyo23_coverage.json"
# What the screen says for 津波 (Architect, 2026-11-05: the fact with its basis,
# never a bare 0 or 対象外).
TSUNAMI_TEXT = "対象外：東京都の津波浸水想定（津波防災地域づくり法第8条）は島しょ部が対象で、区部には設定されていない（国土数値情報 A40 に23区の区域なし）"
TSUNAMI_BASIS = [
    {
        "title": "北海道、福島県、東京都及び岐阜県における津波浸水想定の設定・変更について（令和5年7月28日、国土交通省 社会資本整備審議会 河川分科会 資料7-1）",
        "url": "https://www.mlit.go.jp/river/shinngikai_blog/shaseishin/kasenbunkakai/bunkakai/dai65kai/pdf/7-1.pdf",
        "bytes": 1989492,
        "sha256": "63d4b6877c76bb7b73f556d526663789e71cdd2e07f9e96351b68a4c7d7631ef",
        "page": 4,
        "quote": "津波浸水想定は、東京都の区部を除いて設定済み。",
    },
    {
        "title": "東京都の津波浸水想定について（解説）（東京都）",
        "url": "https://www.bousai.metro.tokyo.lg.jp/_res/projects/default_project/_page_/001/023/364/1.pdf",
        "bytes": 3127169,
        "sha256": "3c6816760d967b8532a6e32a6ebaf16032ced548f0bb07cbbd297b3bfb397244",
        "page": 1,
        "quote": "「津波浸水想定」は、津波防災地域づくりに関する法律（平成 23 年法律第 123 号）第 8 条第１項に基づいて、東京都の島しょ部を対象として実施しました。",
    },
]

# --- 高潮: A49-20 ----------------------------------------------------------------------

A49_ID = "A49-20"
A49_EDITION = "2020年度（令和2年度）版"
A49_YEAR = 2020
A49_PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A49-2024.html"
A49_DOWNLOAD_DIR = DOWNLOADS / "ksj_A49-20_13"
A49_ZIP = "A49-20_13_GML.zip"
A49_SHA256 = "cec46df37c0d8cabc660fc85f8ec6f0cac78b6754a5387f7be21b7a599810390"
A49_MEMBER = "A49-20_13.geojson"
A49_CLASS = "A49_003"
HIGHTIDE_CLASSES = [
    (1, "0.3m未満"),
    (2, "0.3m以上0.5m未満"),
    (3, "0.5m以上1m未満"),
    (4, "1m以上3m未満"),
    (5, "3m以上5m未満"),
    (6, "5m以上10m未満"),
    (7, "10m以上20m未満"),
]
HIGHTIDE_EXCERPT = "ksj_A49-20_tokyo23.csv"
HIGHTIDE_GEOJSON = "ksj_A49-20_guard.geojson"

META = "ksj.meta.json"
CLASS_COLUMNS = ["code", "ward", "class", "label", "m2", "parts"]
LANDSLIDE_COLUMNS = ["code", "ward", "idx", "zone_id", "phenomenon", "zone", "unspecified", "announced", "in_ward_m2"]

# --- licences and credits ---------------------------------------------------------------

LICENCE = {
    "earthquake": {
        "name": "クリエイティブ・コモンズ・ライセンス 表示4.0国際（CC BY 4.0）— 東京都オープンデータ利用規約",
        "url": TOKYO_OD_TERMS,
        "basis": (
            "東京都オープンデータAPIカタログの当該データセットのページ（" + KIKENDO_API_PAGE + "）が「ライセンス クリエイティブ・コモンズ 表示（CC BY）」と"
            "記し、「実データ」としてこの all2.csv を指す（2026-11-04 直接読了）。東京都オープンデータ利用規約（" + TOKYO_OD_TERMS + "）は、"
            "本サイトの著作物を「クリエイティブ・コモンズ・ライセンス表示 4.0 国際」で許諾し（複製・翻案等を自由に、商用可）、第3項で"
            "「コンテンツが、コンテンツ提供者の他のサイトにおいても公開されている場合には、他のサイトの利用規約…と本利用規約が異なるときは、"
            "本利用規約が優先するものとします。」と定める。都市整備局サイトポリシー（" + TOKYO_SITE_POLICY + "）の「無断で複製・転用することはできません」"
            "は同局サイト一般の定めであり、同じファイルがオープンデータとして公開されている本データには、上記第3項によりオープンデータ利用規約が優先する。"
            "カタログ本体（" + KIKENDO_CATALOG + "）はこの環境から HTTP 403（地域制限）で読めず、API カタログのページで読んだ。"
        ),
    },
    "ksj": {
        "name": "国土数値情報 利用規約（PDL1.0準拠）— A31a（2021年度以降）「オープンデータ（CC_BY_4.0）」; A33・A40・A49 は「オープンデータ（CC_BY_4.0（一部制限））」で東京都は「商用利用可・再配信可」; N03「オープンデータ（CC_BY_4.0）」",
        "url": KSJ_TERMS,
    },
}
CREDIT = {
    # 東京都オープンデータ利用規約 2(1)ア / イ: the credit, and for a modified use the
    # sentence that the work is modified, in the form the terms prescribe.
    "kikendo": f"{KIKENDO_TITLE}、東京都、クリエイティブ・コモンズ・ライセンス 表示4.0国際（{CC_BY_JA}）",
    "kikendo_edited": f"このサービスは、以下の著作物を改変して利用しています。{KIKENDO_TITLE}、東京都、クリエイティブ・コモンズ・ライセンス 表示4.0国際（{CC_BY_JA}）",
    "source": f"出典：国土交通省国土数値情報ダウンロードサイト（{KSJ_SITE}）",
    "edited_a31": f"「国土数値情報（洪水浸水想定区域データ）」（国土交通省）（{KSJ_SITE}）を加工して作成",
    "edited_a33": f"「国土数値情報（土砂災害警戒区域データ）」（国土交通省）（{KSJ_SITE}）を加工して作成",
    "edited_a40": f"「国土数値情報（津波浸水想定データ）」（国土交通省）（{KSJ_SITE}）を加工して作成",
    "edited_a49": f"「国土数値情報（高潮浸水想定区域データ）」（国土交通省）（{KSJ_SITE}）を加工して作成",
    "edited_n03": f"「国土数値情報（行政区域データ）」（国土交通省）（{KSJ_SITE}）を加工して作成",
    "pages": {"A31a": A31_PAGE, "A33": A33_PAGE, "A40": A40_PAGE, "A49": A49_PAGE, "kikendo": KIKENDO_API_PAGE},
}
NOTES = {
    "earthquake": RELATIVE_NOTE + "。区の値は、その区の町丁目のうち各ランクに当たる町丁目の数。災害時活動困難度は困難係数のみでランクがないため扱わない",
    "rank5": "総合危険度ランク5の町丁目の数と、区の全町丁目数に対する割合（地図の塗り分け）",
    "flood": "想定最大規模の洪水浸水想定区域のうち、区（行政区域データ N03-20260101 の区ポリゴン）の面積に占める浸水深の区分ごとの割合。複数の河川の区域が重なる所は最も深い区分で数える。都管理河川（東京都）と国管理河川（関東地方整備局：荒川・江戸川・綾瀬川・多摩川・利根川など）を含む",
    "landslide": "区の範囲に掛かる土砂災害警戒区域・特別警戒区域の数（区域番号の数、現象ごと）。区の境をまたぐ区域は両方の区で数える。0 は該当する区域がないこと",
    "tsunami": TSUNAMI_TEXT,
    "hightide": "想定最大規模の高潮浸水想定区域のうち、区の面積に占める浸水深の区分ごとの割合（区分は国土数値情報 A49 の表記のまま）",
    "area": "面積は平面直角座標系第IX系（EPSG:6677、JGD2011）上で計算。区の面積は行政区域データ N03-20260101 の区ポリゴン（河川・海面・埋立地を含む）",
}
# The A33 page's 【重要：データ利用時の注意事項】 bullet that applies to every figure here (2026-11-04).
A33_NOTICE = "本ページで提供する土砂災害警戒区域等の位置は、概略位置を示した参考図であり土砂災害警戒区域等の境界を明示するものではありません。"
# The A31a page's 留意事項 (line 491-492) and 東京都 note (493-496), word for word.
A31_NOTICES = [
    "洪水浸水想定のシミュレーションの実施にあたっては、支川の氾濫、シミュレーションの前提となる降雨を超える規模の降雨、高潮及び内水による氾濫等を考慮していませんので、この洪水浸水想定区域に指定されていない区域においても浸水が発生する場合や、実際の浸水深がこの洪水浸水想定よりも大きい場合があります。",
    "東京都：独自の施策として、洪水予報河川及び水位周知河川以外の河川からの外水氾濫や内水氾濫での浸水も表示した「浸水予想区域図」を作成・公表しており、区市町村等の自治体はこの「浸水予想区域図」を基にハザードマップを作成しています。そのため、住民の方々が所有しているハザードマップと浸水域が異なる場合があります。",
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _check_sha(path: Path, expected: str) -> None:
    actual = sha256(path)
    if actual != expected:
        raise ValueError(f"{path.name}: sha256 {actual} is not the pinned {expected}")


# --- extract ---------------------------------------------------------------------------


def _ward_shapes():
    from shapely.geometry import shape

    gj = _load(N03_FIXTURES / N03_EXCERPT)
    polys: dict = {}
    for f in gj["features"]:
        code = f["properties"].get(N03_CODE)
        if code in WARD_NAMES:
            g = shape(f["geometry"])
            polys[code] = g if code not in polys else polys[code].union(g)
    if sorted(polys) != WARD_CODES:
        raise ValueError("N03 excerpt does not hold the 23 wards")
    return polys


def _rounded(geom):
    from shapely import set_precision
    from shapely.ops import transform

    g = transform(lambda x, y, z=None: (round(x, 9), round(y, 9)), geom)
    return set_precision(g, 1e-9)


def _polygonal(geom):
    """Only the areal parts of a geometry (an intersection can leave lines and points)."""
    from shapely.geometry import MultiPolygon, Polygon

    if geom.is_empty:
        return MultiPolygon()
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    parts = [g for g in getattr(geom, "geoms", []) if isinstance(g, (Polygon, MultiPolygon))]
    flat = []
    for p in parts:
        flat.extend(p.geoms if isinstance(p, MultiPolygon) else [p])
    return MultiPolygon(flat)


def _part_count(geom) -> int:
    """The number of polygons in an areal geometry (0 for none)."""
    from shapely.geometry import Polygon

    if geom is None or geom.is_empty:
        return 0
    g = _polygonal(geom)
    return 1 if isinstance(g, Polygon) else len(g.geoms)


def _mapping(geom) -> dict:
    from shapely.geometry import mapping

    return json.loads(json.dumps(mapping(geom)))


def _area(geom) -> float:
    g = _polygonal(geom)
    return 0.0 if g.is_empty else geometry_area(_mapping(g))


def resolve_classes(features: list[tuple[object, int]], classes: list[int], wards: dict) -> tuple[dict, dict]:
    """features: (lon/lat geometry, class code). Returns (per ward per class the
    rounded geometry of the ward inside that class and no deeper one, and per
    class the number of source polygons)."""
    from shapely import set_precision
    from shapely.ops import unary_union

    by_class: dict[int, list] = defaultdict(list)
    for g, c in features:
        if c not in classes:
            raise ValueError(f"class {c} is not one of {classes}")
        by_class[c].append(set_precision(g if g.is_valid else g.buffer(0), 1e-9))
    union_at_least = {}
    running = None
    for c in sorted(classes, reverse=True):
        parts = by_class.get(c, [])
        u = unary_union(parts) if parts else None
        running = u if running is None else (running if u is None else running.union(u))
        union_at_least[c] = running
        print(f"  union ≥ class {c}: {len(parts)} polygons", flush=True)
    resolved: dict[str, dict[int, object]] = {}
    for code, ward in wards.items():
        resolved[code] = {}
        for c in classes:
            at_least = union_at_least[c]
            deeper = union_at_least.get(c + 1)
            if at_least is None:
                region = None
            else:
                region = at_least if deeper is None else at_least.difference(deeper)
            resolved[code][c] = _rounded(_polygonal(region.intersection(ward))) if region is not None else None
        print(f"  {WARD_NAMES[code]} resolved", flush=True)
    return resolved, {c: len(by_class.get(c, [])) for c in classes}


def _class_rows(resolved: dict, labels: dict[int, str]) -> list[dict]:
    rows = []
    for code in WARD_CODES:
        for c, label in labels.items():
            g = resolved[code][c]
            m2 = _area(g) if g is not None else 0.0
            parts = _part_count(g)
            rows.append({"code": code, "ward": WARD_NAMES[code], "class": c, "label": label, "m2": f"{m2:.3f}", "parts": parts})
    return rows


def _write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    path.write_text(buf.getvalue(), encoding="utf-8")


def _class_geojson(resolved: dict, labels: dict[int, str], title: str, code: str) -> dict:
    feats = []
    for c, label in labels.items():
        g = resolved[code][c]
        if g is None or g.is_empty:
            continue
        feats.append({"type": "Feature", "properties": {"code": code, "ward": WARD_NAMES[code], "class": c, "label": label}, "geometry": _mapping(_polygonal(g))})
    return {"type": "FeatureCollection", "name": f"{title} × {WARD_NAMES[code]}", "features": feats}


def _guard_geojson(resolved: dict, labels: dict[int, str], title: str) -> tuple[str, dict, dict]:
    """The smallest serialized per-ward geometry covering ≥ GEOJSON_MIN_CLASSES classes."""
    sizes = {}
    best = None
    for code in WARD_CODES:
        gj = _class_geojson(resolved, labels, title, code)
        text = json.dumps(gj, ensure_ascii=False, separators=(",", ":"))
        sizes[code] = len(text.encode("utf-8"))
        if len(gj["features"]) >= GEOJSON_MIN_CLASSES and (best is None or sizes[code] < sizes[best[0]]):
            best = (code, gj)
    if best is None:
        raise ValueError(f"{title}: no ward covers {GEOJSON_MIN_CLASSES} classes")
    return best[0], best[1], sizes


def _bbox_of_wards(wards: dict):
    from shapely.geometry import box
    from shapely.ops import unary_union

    return box(*unary_union(list(wards.values())).bounds)


def extract_flood(wards: dict, bbox) -> dict:
    from shapely.geometry import shape

    features = []
    rivers: Counter = Counter()
    zips = []
    for name, pinned, scope in A31_ZIPS:
        path = A31_DOWNLOAD_DIR / name
        _check_sha(path, pinned)
        zips.append({"file": name, "url": f"{KSJ_DATA}/A31a/A31a-25/{name}", "bytes": path.stat().st_size, "sha256": pinned, "scope": scope})
        with zipfile.ZipFile(path) as zf:
            for info in zf.infolist():
                member = info.filename.replace("\\", "/")
                if A31_MEMBER_DIR not in member or not member.endswith(".geojson"):
                    continue
                with zf.open(info) as fh:
                    gj = json.load(fh)
                for f in gj["features"]:
                    g = shape(f["geometry"])
                    if not g.intersects(bbox):
                        continue
                    rank = int(f["properties"][A31_RANK])
                    features.append((g, rank))
                    rivers[f"{f['properties']['A31a_202']}（{f['properties']['A31a_204']}）"] += 1
        print(f"A31a {name}: kept {len(features)} so far", flush=True)
    resolved, per_class = resolve_classes(features, [c for c, _ in FLOOD_CLASSES], wards)
    labels = dict(FLOOD_CLASSES)
    _write_csv(FIXTURES / FLOOD_EXCERPT, CLASS_COLUMNS, _class_rows(resolved, labels))
    guard, gj, sizes = _guard_geojson(resolved, labels, f"{A31_ID} 想定最大規模 浸水深ランク別（最も深い区分）")
    (FIXTURES / FLOOD_GEOJSON).write_text(json.dumps(gj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"  guard ward {WARD_NAMES[guard]} ({sizes[guard]} B)", flush=True)
    return {"guard_ward": guard, "guard_sizes": sizes, "zips": zips, "polygons_kept": len(features), "polygons_per_class": per_class, "rivers": dict(sorted(rivers.items()))}


def extract_hightide(wards: dict, bbox) -> dict:
    from shapely.geometry import shape

    path = A49_DOWNLOAD_DIR / A49_ZIP
    _check_sha(path, A49_SHA256)
    code_of = {label: c for c, label in HIGHTIDE_CLASSES}
    features = []
    with zipfile.ZipFile(path) as zf:
        gj = json.loads(zf.read(A49_MEMBER).decode("utf-8"))
    for f in gj["features"]:
        label = f["properties"][A49_CLASS]
        if label not in code_of:
            raise ValueError(f"A49 class {label!r} not in {list(code_of)}")
        g = shape(f["geometry"])
        if g.intersects(bbox):
            features.append((g, code_of[label]))
    resolved, per_class = resolve_classes(features, [c for c, _ in HIGHTIDE_CLASSES], wards)
    labels = dict(HIGHTIDE_CLASSES)
    _write_csv(FIXTURES / HIGHTIDE_EXCERPT, CLASS_COLUMNS, _class_rows(resolved, labels))
    guard, gj, sizes = _guard_geojson(resolved, labels, f"{A49_ID} 高潮浸水想定区域 浸水深区分別（最も深い区分）")
    (FIXTURES / HIGHTIDE_GEOJSON).write_text(json.dumps(gj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"  guard ward {WARD_NAMES[guard]} ({sizes[guard]} B)", flush=True)
    return {"guard_ward": guard, "guard_sizes": sizes, "file": A49_ZIP, "url": f"{KSJ_DATA}/A49/A49-20/{A49_ZIP}", "bytes": path.stat().st_size, "sha256": A49_SHA256, "member": A49_MEMBER, "polygons_in_file": len(gj["features"]), "polygons_kept": len(features), "polygons_per_class": per_class}


def extract_landslide(wards: dict) -> dict:
    from shapely.geometry import shape
    from shapely.strtree import STRtree

    path = A33_DOWNLOAD_DIR / A33_ZIP
    _check_sha(path, A33_SHA256)
    with zipfile.ZipFile(path) as zf:
        gj = json.loads(zf.read(A33_MEMBER).decode("utf-8"))
        members = [n for n in zf.namelist() if n.replace("\\", "/").endswith(A33_NOTICE_MEMBER.split("\\")[-1])]
        raw = zf.read(members[0]) if members else b""
        try:
            notice = raw.decode("utf-8")
        except UnicodeDecodeError:
            notice = raw.decode("cp932")
    if "本データは2025年7月30日時点の整備です。" not in notice:
        raise ValueError("A33-25 東京都 notice does not carry the 2025年7月30日 date")
    feats = gj["features"]
    geoms = [shape(f["geometry"]) for f in feats]
    tree = STRtree(geoms)
    rows = []
    for code, ward in wards.items():
        for i in tree.query(ward, predicate="intersects"):
            p = feats[i]["properties"]
            if p["A33_002"] not in ZONES or p["A33_001"] not in PHENOMENA:
                raise ValueError(f"A33 #{i}: 現象 {p['A33_001']} / 区分 {p['A33_002']} outside the codelists")
            g = geoms[i] if geoms[i].is_valid else geoms[i].buffer(0)
            m2 = _area(_rounded(_polygonal(g.intersection(ward))))
            if m2 <= 0:
                continue
            rows.append(
                {
                    "code": code, "ward": WARD_NAMES[code], "idx": int(i), "zone_id": p["A33_004"],
                    "phenomenon": p["A33_001"], "zone": p["A33_002"], "unspecified": p.get("A33_008"),
                    "announced": p.get("A33_007"), "in_ward_m2": f"{m2:.3f}",
                }
            )
    rows.sort(key=lambda r: (r["code"], r["idx"]))
    _write_csv(FIXTURES / LANDSLIDE_EXCERPT, LANDSLIDE_COLUMNS, rows)
    return {"file": A33_ZIP, "url": f"{KSJ_DATA}/A33/A33-25/{A33_ZIP}", "bytes": path.stat().st_size, "sha256": A33_SHA256, "member": A33_MEMBER, "polygons_in_file": len(feats), "rows_kept": len(rows), "tokyo_asof": A33_TOKYO_ASOF, "notice_line": "本データは2025年7月30日時点の整備です。"}


def extract_tsunami(wards: dict, bbox) -> dict:
    from shapely.geometry import shape

    path = A40_DOWNLOAD_DIR / A40_ZIP
    _check_sha(path, A40_SHA256)
    with zipfile.ZipFile(path) as zf:
        gj = json.loads(zf.read(A40_MEMBER).decode("utf-8"))
    feats = gj["features"]
    geoms = [shape(f["geometry"]) for f in feats]
    xs = [g.bounds for g in geoms]
    extent = [min(b[0] for b in xs), min(b[1] for b in xs), max(b[2] for b in xs), max(b[3] for b in xs)]
    in_bbox = sum(1 for g in geoms if g.intersects(bbox))
    hits = {code: sum(1 for g in geoms if g.intersects(ward)) for code, ward in wards.items()}
    classes = Counter(f["properties"]["A40_003"] for f in feats)
    coverage = {
        "source": {"id": A40_ID, "page": A40_PAGE, "file": A40_ZIP, "url": f"{KSJ_DATA}/A40/A40-23/{A40_ZIP}", "bytes": path.stat().st_size, "sha256": A40_SHA256, "member": A40_MEMBER, "licence": "オープンデータ（CC_BY_4.0（一部制限））— 東京都 「オープンデータとして利用可（商用利用可・再配信可）」"},
        "polygons": len(feats),
        "extent_lonlat": [round(v, 6) for v in extent],
        "wards_bbox_lonlat": [round(v, 6) for v in bbox.bounds],
        "polygons_in_wards_bbox": in_bbox,
        "polygons_per_ward": hits,
        "classes": dict(sorted(classes.items())),
        "basis": TSUNAMI_BASIS,
        "determination": "notCovered",
        "text": TSUNAMI_TEXT,
    }
    if in_bbox or any(hits.values()):
        raise ValueError("A40-23 reaches the 23 wards — the 対象外 determination no longer holds")
    (FIXTURES / TSUNAMI_EXCERPT).write_text(json.dumps(coverage, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return coverage["source"]


def extract(today: date | None = None, only: set[str] | None = None) -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    wards = _ward_shapes()
    bbox = _bbox_of_wards(wards)
    meta_path = FIXTURES / META
    meta = _load(meta_path) if meta_path.is_file() else {}
    want = only or {"kikendo", "flood", "hightide", "landslide", "tsunami"}
    if "kikendo" in want:
        src = KIKENDO_DOWNLOAD_DIR / KIKENDO_FILE
        _check_sha(src, KIKENDO_SHA256)
        (FIXTURES / KIKENDO_EXCERPT).write_bytes(src.read_bytes())
        meta["kikendo"] = {
            "title": KIKENDO_TITLE, "url": KIKENDO_URL, "served_at": KIKENDO_SERVED_AT, "file": KIKENDO_FILE,
            "bytes": src.stat().st_size, "sha256": KIKENDO_SHA256, "encoding": "cp932",
            "last_modified": "Tue, 01 Oct 2024 09:54:46 GMT", "published": "2022-09-09（令和4年9月公表; 作成日 2022/09/09 13:45:57 on the API catalog page）",
            "press": KIKENDO_PRESS, "catalog": KIKENDO_CATALOG, "api_page": KIKENDO_API_PAGE, "committed": "whole, byte for byte",
        }
    if "flood" in want:
        meta["A31a"] = {"id": A31_ID, "edition": A31_EDITION, "year": A31_YEAR, "page": A31_PAGE, "member_dir": A31_MEMBER_DIR, "codelist": {"url": FLOOD_CODELIST, "sha256": FLOOD_CODELIST_SHA256}, **extract_flood(wards, bbox)}
    if "hightide" in want:
        meta["A49"] = {"id": A49_ID, "edition": A49_EDITION, "year": A49_YEAR, "page": A49_PAGE, **extract_hightide(wards, bbox)}
    if "landslide" in want:
        meta["A33"] = {"id": A33_ID, "edition": A33_EDITION, "year": A33_YEAR, "page": A33_PAGE, **extract_landslide(wards)}
    if "tsunami" in want:
        meta["A40"] = extract_tsunami(wards, bbox)
    n03_meta = _load(N03_FIXTURES / N03_META)["N03"]
    areas = ward_areas()
    meta["N03"] = {
        **{k: n03_meta[k] for k in ("id", "edition", "page", "url", "file", "bytes", "sha256")},
        "excerpt": f"backend/tests/fixtures/stations/{N03_EXCERPT}",
        "excerpt_sha256": sha256(N03_FIXTURES / N03_EXCERPT),
        "ward_area_m2": {code: f"{areas[code]:.3f}" for code in WARD_CODES},
    }
    meta["fetched"] = (today or date.today()).isoformat()
    meta["projection"] = {"crs": "EPSG:6677 平面直角座標系第IX系（JGD2011）", "method": "etl/zoning.py tm_project + shoelace on geometry rounded to 9 decimals; set operations on JGD2011 lon/lat (shapely, grid 1e-9°)"}
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote excerpts and {meta_path}")


# --- build ---------------------------------------------------------------------------


def read_kikendo(fixtures: Path = FIXTURES) -> list[dict]:
    raw = (fixtures / KIKENDO_EXCERPT).read_bytes()
    rows = list(csv.reader(io.StringIO(raw.decode("cp932"))))
    if rows[0] != KIKENDO_COLUMNS:
        raise ValueError(f"地域危険度 header {rows[0]} is not the pinned one")
    out = [dict(zip(KIKENDO_COLUMNS, r, strict=True)) for r in rows[1:] if r]
    if len(out) != KIKENDO_ALL_ROWS:
        raise ValueError(f"地域危険度: {len(out)} 町丁目, expected {KIKENDO_ALL_ROWS}")
    for r in out:
        for _, _, col in KINDS:
            if r[col] not in {"1", "2", "3", "4", "5"}:
                raise ValueError(f"{r['区市町名']} {r['町丁目名']}: {col} {r[col]!r}")
    return out


def _rank_counts(rows: list[dict]) -> dict:
    counts = {key: [sum(1 for r in rows if r[col] == str(k)) for k in RANKS] for key, _, col in KINDS}
    n = len(rows)
    rank5 = counts["total"][4]
    return {"n": n, "ranks": counts, "rank5": rank5, "rank5Share": round(rank5 / n * 100, 4) if n else None, "relative": RELATIVE_NOTE}


def read_classes(name: str, labels: list[tuple[int, str]], fixtures: Path = FIXTURES) -> dict[str, dict[int, float]]:
    rows = list(csv.DictReader((fixtures / name).read_text(encoding="utf-8").splitlines()))
    out: dict[str, dict[int, float]] = {code: {} for code in WARD_CODES}
    want = dict(labels)
    for r in rows:
        c = int(r["class"])
        if want.get(c) != r["label"]:
            raise ValueError(f"{name}: class {c} label {r['label']!r} != {want.get(c)!r}")
        out[r["code"]][c] = float(r["m2"])
    for code in WARD_CODES:
        if sorted(out[code]) != [c for c, _ in labels]:
            raise ValueError(f"{name}: {code} lacks a class row")
    return out


def _class_block(m2: dict[int, float], ward_m2: float, labels: list[tuple[int, str]], deep_from: int | None = None) -> dict:
    classes = [{"code": c, "label": label, "m2": round(m2[c], 3), "share": round(m2[c] / ward_m2 * 100, 4)} for c, label in labels]
    inside = sum(m2.values())
    if inside > ward_m2 * (1 + 1e-9):
        raise ValueError(f"class areas {inside} exceed the ward {ward_m2}")
    block = {"wardM2": round(ward_m2, 3), "m2": round(inside, 3), "share": round(inside / ward_m2 * 100, 4), "classes": classes}
    if deep_from is not None:
        deep = sum(m2[c] for c, _ in labels if c >= deep_from)
        block["deepM2"] = round(deep, 3)
        block["deepShare"] = round(deep / ward_m2 * 100, 4)
    return block


def read_landslide(fixtures: Path = FIXTURES) -> list[dict]:
    rows = list(csv.DictReader((fixtures / LANDSLIDE_EXCERPT).read_text(encoding="utf-8").splitlines()))
    for r in rows:
        r["phenomenon"], r["zone"] = int(r["phenomenon"]), int(r["zone"])
        if r["phenomenon"] not in PHENOMENA or r["zone"] not in ZONES or float(r["in_ward_m2"]) <= 0:
            raise ValueError(f"A33 row {r} outside the codelists or without area")
    return rows


def _landslide_counts(rows: list[dict]) -> dict:
    """Per 現象: the number of distinct 区域番号 per 区分 (0 when none)."""
    out = []
    for p, pname in PHENOMENA.items():
        entry = {"code": p, "name": pname}
        for z, zname in ZONES.items():
            entry["warning" if z == 1 else "special"] = len({r["zone_id"] for r in rows if r["phenomenon"] == p and r["zone"] == z})
        out.append(entry)
    return {
        "phenomena": out,
        "warning": len({(r["phenomenon"], r["zone_id"]) for r in rows if r["zone"] == 1}),
        "special": len({(r["phenomenon"], r["zone_id"]) for r in rows if r["zone"] == 2}),
    }


def _ward_record(code: str, name: str, kikendo_rows: list[dict], ward_m2: float, flood_m2: dict, tide_m2: dict, slide_rows: list[dict]) -> dict:
    return {
        "code": code,
        "name": name,
        "earthquake": _rank_counts(kikendo_rows),
        "flood": _class_block(flood_m2, ward_m2, FLOOD_CLASSES, FLOOD_DEEP_FROM),
        "landslide": _landslide_counts(slide_rows),
        "tsunami": {"status": "notCovered", "text": TSUNAMI_TEXT},
        "hightide": _class_block(tide_m2, ward_m2, HIGHTIDE_CLASSES),
    }


def build(fixtures: Path = FIXTURES, n03_fixtures: Path = N03_FIXTURES) -> dict:
    meta = _load(fixtures / META)
    areas = ward_areas(n03_fixtures)
    for code in WARD_CODES:
        recorded = meta["N03"]["ward_area_m2"].get(code)
        if recorded is None or abs(float(recorded) - areas[code]) > 1e-3:
            raise ValueError(f"{code}: N03 ward area {areas[code]} != meta {recorded}")
    if sha256(fixtures / KIKENDO_EXCERPT) != KIKENDO_SHA256:
        raise ValueError("the committed 地域危険度 CSV is not the pinned file")
    kikendo = read_kikendo(fixtures)
    flood = read_classes(FLOOD_EXCERPT, FLOOD_CLASSES, fixtures)
    tide = read_classes(HIGHTIDE_EXCERPT, HIGHTIDE_CLASSES, fixtures)
    slides = read_landslide(fixtures)
    coverage = _load(fixtures / TSUNAMI_EXCERPT)
    if coverage["determination"] != "notCovered" or coverage["polygons_in_wards_bbox"] != 0 or any(coverage["polygons_per_ward"].values()):
        raise ValueError("the A40 coverage table no longer supports 対象外")

    wards = []
    for code, name in WARD_NAMES.items():
        mine = [r for r in kikendo if r["区市町名"] == name]
        if not mine:
            raise ValueError(f"{name}: no 町丁目 in the 地域危険度 CSV")
        wards.append(_ward_record(code, name, mine, areas[code], flood[code], tide[code], [r for r in slides if r["code"] == code]))
    ward_names = set(WARD_NAMES.values())
    total_area = sum(areas.values())
    total = _ward_record(
        TOTAL_CODE,
        REGION,
        [r for r in kikendo if r["区市町名"] in ward_names],
        total_area,
        {c: sum(flood[code][c] for code in WARD_CODES) for c, _ in FLOOD_CLASSES},
        {c: sum(tide[code][c] for code in WARD_CODES) for c, _ in HIGHTIDE_CLASSES},
        slides,
    )
    # A zone that straddles two wards counts once in the 23区 total.
    total["landslide"] = _landslide_counts(slides)

    a31, a33, a49, k = meta["A31a"], meta["A33"], meta["A49"], meta["kikendo"]
    return {
        "region": REGION,
        "sources": {
            "earthquake": {"year": 2022, "table": "地域危険度 第9回", "label": f"東京都「{KIKENDO_TITLE}」町丁目別ランク（総合・建物倒壊・火災）"},
            "flood": {"year": A31_YEAR, "table": A31_ID, "label": f"国土数値情報 洪水浸水想定区域データ（河川単位）{A31_EDITION} 想定最大規模（東京都・関東地方整備局）"},
            "landslide": {"year": A33_YEAR, "table": A33_ID, "label": f"国土数値情報 土砂災害警戒区域データ {A33_EDITION}（東京都 2025年7月30日時点）"},
            "tsunami": {"year": 2023, "table": A40_ID, "label": "国土数値情報 津波浸水想定データ（東京都、A40-23）"},
            "hightide": {"year": A49_YEAR, "table": A49_ID, "label": f"国土数値情報 高潮浸水想定区域データ {A49_EDITION} 東京都 想定最大規模"},
            "wards": {"year": int(meta["N03"]["id"][4:8]), "table": meta["N03"]["id"], "label": f"国土数値情報 行政区域データ {meta['N03']['edition']} 東京都（区の面積）"},
        },
        "hazards": {
            "earthquake": {"kinds": [{"key": key, "name": name} for key, name, _ in KINDS], "ranks": RANKS, "relative": RELATIVE_NOTE, "allChochomoku": KIKENDO_ALL_ROWS},
            "flood": {"classes": [{"code": c, "label": label} for c, label in FLOOD_CLASSES], "deepFrom": FLOOD_DEEP_FROM, "deepLabel": "浸水深3m以上"},
            "landslide": {"phenomena": [{"code": c, "name": n} for c, n in PHENOMENA.items()], "zones": [{"code": c, "name": n} for c, n in ZONES.items()]},
            "tsunami": {"status": "notCovered", "text": TSUNAMI_TEXT, "basis": TSUNAMI_BASIS},
            "hightide": {"classes": [{"code": c, "label": label} for c, label in HIGHTIDE_CLASSES]},
        },
        "inputs": {
            KIKENDO_EXCERPT: {"path": f"backend/tests/fixtures/disaster/{KIKENDO_EXCERPT}", "sha256": KIKENDO_SHA256, "cut_from": k},
            FLOOD_EXCERPT: {"path": f"backend/tests/fixtures/disaster/{FLOOD_EXCERPT}", "sha256": sha256(fixtures / FLOOD_EXCERPT), "cut_from": {kk: a31[kk] for kk in ("id", "edition", "year", "page", "zips", "member_dir", "polygons_kept", "codelist")}},
            HIGHTIDE_EXCERPT: {"path": f"backend/tests/fixtures/disaster/{HIGHTIDE_EXCERPT}", "sha256": sha256(fixtures / HIGHTIDE_EXCERPT), "cut_from": {kk: a49[kk] for kk in ("id", "edition", "year", "page", "file", "url", "bytes", "sha256", "polygons_kept")}},
            LANDSLIDE_EXCERPT: {"path": f"backend/tests/fixtures/disaster/{LANDSLIDE_EXCERPT}", "sha256": sha256(fixtures / LANDSLIDE_EXCERPT), "cut_from": {kk: a33[kk] for kk in ("id", "edition", "year", "page", "file", "url", "bytes", "sha256", "rows_kept", "tokyo_asof")}},
            TSUNAMI_EXCERPT: {"path": f"backend/tests/fixtures/disaster/{TSUNAMI_EXCERPT}", "sha256": sha256(fixtures / TSUNAMI_EXCERPT), "cut_from": coverage["source"]},
            N03_EXCERPT: {"path": meta["N03"]["excerpt"], "sha256": meta["N03"]["excerpt_sha256"], "cut_from": {kk: meta["N03"][kk] for kk in ("id", "edition", "page", "url", "file", "bytes", "sha256")}},
        },
        "projection": meta["projection"],
        "licence": LICENCE,
        "credit": CREDIT,
        "notices": {"A31a": A31_NOTICES, "A33": [A33_NOTICE]},
        "notes": NOTES,
        "total": total,
        "wards": wards,
    }


# --- hero ----------------------------------------------------------------------------

HERO_ROWS = 6


def hero(land_prices: dict, disaster: dict) -> dict:
    """The LP hero (Architect decision 11, 2026-11-05): the six wards with the
    highest L01 住宅地 平均変動率 (継続地点), each with its 地震 figure (the K2
    count: 総合危険度ランク5の町丁目 of n) and its 洪水 figure (share of the
    ward's area with 浸水深 3 m 以上, 想定最大規模)."""
    by_code = {w["code"]: w for w in disaster["wards"]}
    ranked = sorted(
        (w for w in land_prices["wards"] if w["residential"].get("meanChange") is not None),
        key=lambda w: (-w["residential"]["meanChange"], w["code"]),
    )[:HERO_ROWS]
    rows = []
    for w in ranked:
        d = by_code[w["code"]]
        rows.append(
            {
                "code": w["code"],
                "region": w["name"],
                "change": w["residential"]["meanChange"],
                "nContinuing": w["residential"]["nContinuing"],
                "rank5": d["earthquake"]["rank5"],
                "chochomoku": d["earthquake"]["n"],
                "floodDeepShare": d["flood"]["deepShare"],
            }
        )
    lp_change = land_prices["sources"]["change"]
    return {
        "upside": {"label": lp_change["label"], "table": lp_change["table"], "year": lp_change["year"], "use": "住宅地", "definition": land_prices["notes"]["change"]},
        "earthquake": {"label": disaster["sources"]["earthquake"]["label"], "short": KIKENDO_SHORT, "definition": "総合危険度ランク5の町丁目の数（区の全町丁目中）", "relative": RELATIVE_NOTE},
        "flood": {"label": disaster["sources"]["flood"]["label"], "table": A31_ID, "definition": "区の面積に占める浸水深3m以上の区域の割合（想定最大規模）"},
        "rows": rows,
    }


# --- verify ---------------------------------------------------------------------------


def verify(fixtures: Path = FIXTURES) -> list[str]:
    """Re-derive the guard ward's 洪水 and 高潮 class areas from the committed GeoJSON."""
    problems = []
    for gj_name, csv_name, labels in ((FLOOD_GEOJSON, FLOOD_EXCERPT, FLOOD_CLASSES), (HIGHTIDE_GEOJSON, HIGHTIDE_EXCERPT, HIGHTIDE_CLASSES)):
        rows = {(r["code"], int(r["class"])): r for r in csv.DictReader((fixtures / csv_name).read_text(encoding="utf-8").splitlines())}
        seen = set()
        features = _load(fixtures / gj_name)["features"]
        codes = {f["properties"]["code"] for f in features}
        if len(codes) != 1 or len(features) < GEOJSON_MIN_CLASSES:
            problems.append(f"{gj_name}: expected one ward with ≥ {GEOJSON_MIN_CLASSES} classes, got {sorted(codes)} / {len(features)}")
            continue
        guard = codes.pop()
        for f in features:
            p = f["properties"]
            row = rows.get((p["code"], p["class"]))
            seen.add(p["class"])
            if row is None:
                problems.append(f"{gj_name}: class {p['class']} not in {csv_name}")
                continue
            area = f"{geometry_area(f['geometry']):.3f}"
            if area != row["m2"]:
                problems.append(f"{gj_name}: class {p['class']} GeoJSON {area} != CSV {row['m2']}")
        for c, _ in labels:
            if c not in seen and float(rows[(guard, c)]["m2"]) != 0:
                problems.append(f"{gj_name}: class {c} has area in the CSV but no geometry")
    return problems


def main(argv: list[str]) -> int:
    if argv[1:2] == ["extract"]:
        extract(only=set(argv[2:]) or None)
    elif argv[1:] == ["build"]:
        snapshot = build()
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        t = snapshot["total"]
        print(f"wrote {SNAPSHOT} (23区: 総合危険度ランク5 {t['earthquake']['rank5']} of {t['earthquake']['n']} 町丁目; 浸水深3m以上 {t['flood']['deepShare']:.1f} %)")
    elif argv[1:] == ["hero"]:
        h = hero(_load(LAND_PRICES), _load(SNAPSHOT))
        HERO.parent.mkdir(parents=True, exist_ok=True)
        HERO.write_text(json.dumps(h, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {HERO}: " + ", ".join(f"{r['region']} {r['change']:+.2f}%" for r in h["rows"]))
    elif argv[1:] == ["verify"]:
        problems = verify()
        print("\n".join(problems) if problems else "verify: each guard GeoJSON re-derives its ward's 洪水 / 高潮 rows")
        return 1 if problems else 0
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
