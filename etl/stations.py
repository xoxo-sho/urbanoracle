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

Real-data plan PR 4b (Architect decisions 2026-11-09) adds, all from the same
committed excerpt:

* 乗降客数推移: the sum, per ward and for the 23 wards, of a fixed panel of
  units over 2018 and 2020–2024 (``ridership_panel.json`` beside the excerpts
  says, per unit, in or out and the reason class of every excluded one). 2019
  is a gap: S12's 乗降客数2019 repeats 乗降客数2018 on every 東日本旅客鉄道 row of
  the panel. Values are S12's as published — nothing adjusted or re-dated;
* each figure row's 備考 of the snapshot's year, as S12 writes it;
* for a station every row of which says 他路線駅に記載 (重複コード 2): the row
  that names it in its 備考 — where the figure is counted — or the plain
  statement that S12 names none;
* S12's own notice on what the operators' figures are, verbatim.

Follow-up 3 (Architect decision A, 2026-11-09) adds 東京都交通局's own figures
beside S12's, for every 都営地下鉄 and 日暮里・舎人ライナー station-line of the 23
wards. Every sum stays on S12 — 日間乗降客, 事業者別, 乗降客数推移 — and no
number in them changes; the 交通局 figure is shown, never added.

  extract-toei  the three raw responses of the 公共交通オープンデータセンター's
                public endpoint (git-ignored downloads; no key, no account)
                → the 乗降者数情報 response committed whole, a cut of the
                station and railway names and coordinates, and a sidecar
                meta with each response's URL, retrieval time, size and
                sha256

Source: 東京都交通局 乗降者数情報 (odpt:PassengerSurvey, odpt.Operator:Toei),
https://ckan.odpt.org/dataset/r_passenger_survey-toei — CC BY 4.0, 「コンテンツ等
の提供者名: 東京都交通局・公共交通オープンデータ協議会」. One object per line and
station with a 1日平均乗降人員 per 年度: 都営地下鉄 2017–2024, 日暮里・舎人ライナー
2017–2023 (the latest open figure). A station-line is matched to S12's 東京都
row of the same line and station name; build fails on a station-line inside
the 23 wards that matches none, and the snapshot lists every renamed or
out-of-scope case. S12 was the sole ridership source until then (decision 3,
2026-11-02) and remains the only one any sum uses; the live client and its
key stay retired — the snapshot is built from a committed file.

Run (from the repo root, with -I so nothing in the download dir is imported):

  python -I etl/stations.py extract
  python -I etl/stations.py extract-toei
  python -I etl/stations.py build
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
import unicodedata
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

# --- 乗降客数推移: the committed panel (real-data plan PR 4b) ------------------------

PANEL = "ridership_panel.json"
TOTAL_CODE = "13100"
REASON_CLASSES = ("repeat_or_lag", "definition_change", "opened_or_closed", "entry_error", "unexplained")
INCLUDES = "を含む"
COUNTED_ELSEWHERE = "他の行に計上"
COUNTED_ELSEWHERE_UNNAMED = "他の行に計上（国土数値情報に記載先の明示なし）"
# How an operator is written in the 「…に含まれます」 note: the three every
# reader knows by a short name, the rest as the source names them.
NOTE_OPERATORS = {"東日本旅客鉄道": "JR", "東京地下鉄": "東京メトロ", "東京都": "都営"}

# --- 東京都交通局の公表値 (follow-up 3, Architect decision A) ------------------------------

ODPT_DOWNLOAD_DIR = DOWNLOADS / "odpt_toei"
ODPT_API = "https://api-public.odpt.org/api/v4/"
ODPT_OPERATOR = "odpt.Operator:Toei"
ODPT_SURVEY = "odpt_PassengerSurvey_Toei.json"
ODPT_STATIONS_RAW = "odpt_Station_Toei.json"
ODPT_RAILWAYS_RAW = "odpt_Railway_Toei.json"
ODPT_RETRIEVED = "retrieved_at.txt"
ODPT_URLS = {
    ODPT_SURVEY: f"{ODPT_API}odpt:PassengerSurvey?odpt:operator={ODPT_OPERATOR}",
    ODPT_STATIONS_RAW: f"{ODPT_API}odpt:Station?odpt:operator={ODPT_OPERATOR}",
    ODPT_RAILWAYS_RAW: f"{ODPT_API}odpt:Railway?odpt:operator={ODPT_OPERATOR}",
}
ODPT_TITLES = "odpt_toei_titles.json"
ODPT_META = "odpt.meta.json"
ODPT_CATALOG = "https://ckan.odpt.org/dataset/r_passenger_survey-toei"
ODPT_FAQ = "https://developer.odpt.org/ja/faq-info"
ODPT_PROVIDER = "東京都交通局・公共交通オープンデータ協議会"
ODPT_CONTENT = "東京都交通局 乗降者数情報"
ODPT_TABLE = "odpt:PassengerSurvey"
TOEI_OPERATOR = "東京都"
TOEI_PUBLISHER = "東京都交通局"
TOEI_LINER = "日暮里・舎人ライナー"
TOEI_SUBWAY = "都営地下鉄"
CC_BY_JA = "https://creativecommons.org/licenses/by/4.0/deed.ja"
# The credit in the form the センター's FAQ prescribes (ODPT_FAQ, read 2026-11-09):
# 1 「【コンテンツ等の提供者名】、【コンテンツ等の名称】、クリエイティブ・コモンズ・
# ライセンス　表示4.0国際（URL）」 and, for a modified use, 2 「この【作品・アプリ・
# データベース等】は、以下の著作物を改変して利用しています。」 before it. The
# provider name is the one the dataset's catalogue page gives (ODPT_CATALOG).
ODPT_CREDIT = f"{ODPT_PROVIDER}、{ODPT_CONTENT}、クリエイティブ・コモンズ・ライセンス　表示4.0国際（{CC_BY_JA}）"
ODPT_CREDIT_EDITED = f"このサービスは、以下の著作物を改変して利用しています。 {ODPT_CREDIT}"  # the FAQ sets a space after the sentence
TOEI_TRANSFERS_PAGE = "https://spec.api.metro.tokyo.lg.jp/spec/t000018d0000000030-d5e3d4a98f96a77e0d2857ff3ab150fd-0?lang=ja"
TOEI_TRANSFERS_QUOTE = "（注）「一日平均乗降人員」は、浅草線、三田線、新宿線、大江戸線の乗降人員の合計から、都営線相互の乗り換え客数を引いたものです。したがって、4線の乗降人員の単純合計とは一致しません。"

REGION = "東京23区"
LICENCE = {
    "name": "国土数値情報 利用規約（PDL1.0準拠）— 駅別乗降客数データ・行政区域データはいずれも「オープンデータ（CC_BY_4.0）」",
    "url": KSJ_TERMS,
    "operatorFigures": {
        "name": "クリエイティブ・コモンズ・ライセンス 表示4.0国際（CC BY 4.0）",
        "url": CC_BY_JA,
        "basis": (
            "公共交通オープンデータセンター データカタログサイトの当該データセットのページ（" + ODPT_CATALOG + "、2026-11-09 直接読了）が"
            "「ライセンス Creative Commons Attribution 4.0 International (CC BY 4.0)」「※本コンテンツ等はCC BY 4.0の下でライセンスされています。」"
            "「コンテンツ等の提供者名: " + ODPT_PROVIDER + "」と記す。クレジットの形は開発者サイトの FAQ（" + ODPT_FAQ + "、同日直接読了）に従う。"
            "取得はアクセストークンの要らない公開エンドポイント（api-public）から行い、アクセストークンもユーザ登録も使っていない。"
        ),
    },
}
CREDIT = {
    "source": f"出典：国土交通省国土数値情報ダウンロードサイト（{KSJ_SITE}）",
    "edited_s12": f"「国土数値情報（駅別乗降客数データ）」（国土交通省）（{KSJ_SITE}）を加工して作成",
    "edited_n03": f"「国土数値情報（行政区域データ）」（国土交通省）（{KSJ_SITE}）を加工して作成",
    "toei": ODPT_CREDIT,
    "toei_edited": ODPT_CREDIT_EDITED,
    "pages": {"S12": S12_PAGE, "N03": N03_PAGE, "toei": ODPT_CATALOG},
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
    # S12's own notice, verbatim: the second bullet of 「その他の情報」 on the
    # dataset's page (S12_PAGE), read 2026-11-09.
    "source_notice": "各事業者から提供された駅別乗降客数は、各社で独自に算出したものであり、統一的な基準に基づいたものではありませんので、その旨を認識した上でご利用ください。",
    "source_notice_at": f"国土数値情報 駅別乗降客数データ（国土交通省）「その他の情報」（{S12_PAGE}）",
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


def _name_key(name: str) -> str:
    """Station names compared without the differences of writing only: width
    (NFKC), the small ヶ against ケ, and spaces."""
    return unicodedata.normalize("NFKC", name).replace("ヶ", "ケ").replace(" ", "")


def extract_toei(out_dir: Path = FIXTURES) -> None:
    """The three raw public-endpoint responses → the committed 乗降者数情報 (whole),
    the names cut, and the meta. Nothing is fetched here: the files are
    downloaded beforehand, with the UTC time of the download beside them."""
    raw = {name: (ODPT_DOWNLOAD_DIR / name).read_bytes() for name in ODPT_URLS}
    retrieved = (ODPT_DOWNLOAD_DIR / ODPT_RETRIEVED).read_text(encoding="utf-8").strip()
    survey, stations, railways = (json.loads(raw[name].decode("utf-8")) for name in (ODPT_SURVEY, ODPT_STATIONS_RAW, ODPT_RAILWAYS_RAW))
    wanted_stations: set[str] = set()
    wanted_railways: set[str] = set()
    for obj in survey:
        if obj.get("odpt:operator") != ODPT_OPERATOR or obj.get("odpt:includeAlighting") is not True:
            raise ValueError(f"{obj.get('owl:sameAs')}: not a {ODPT_OPERATOR} 乗降人員 object")
        if len(obj["odpt:station"]) != 1 or len(obj["odpt:railway"]) != 1:
            raise ValueError(f"{obj['owl:sameAs']}: expected one station and one railway")
        wanted_stations.add(obj["odpt:station"][0])
        wanted_railways.add(obj["odpt:railway"][0])
    station_by_id = {x["owl:sameAs"]: x for x in stations}
    railway_by_id = {x["owl:sameAs"]: x for x in railways}
    missing = sorted(wanted_stations - set(station_by_id)) + sorted(wanted_railways - set(railway_by_id))
    if missing:
        raise ValueError(f"the names of {missing} are not in the station / railway responses")
    titles = {
        "railways": {rid: {"title": railway_by_id[rid]["odpt:railwayTitle"]["ja"]} for rid in sorted(wanted_railways)},
        "stations": {
            sid: {
                "title": station_by_id[sid]["odpt:stationTitle"]["ja"],
                "railway": station_by_id[sid]["odpt:railway"],
                "lat": station_by_id[sid]["geo:lat"],
                "lng": station_by_id[sid]["geo:long"],
            }
            for sid in sorted(wanted_stations)
        },
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / ODPT_SURVEY).write_bytes(raw[ODPT_SURVEY])
    (out_dir / ODPT_TITLES).write_text(json.dumps(titles, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    years = sorted({o["odpt:surveyYear"] for obj in survey for o in obj["odpt:passengerSurveyObject"]})
    meta = {
        "retrieved": retrieved,
        "endpoint": "公共交通オープンデータセンター 公開エンドポイント（api-public.odpt.org）— アクセストークン不要、ユーザ登録不要",
        "catalog": ODPT_CATALOG,
        "licence": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        "licence_url": CC_BY_JA,
        "provider": ODPT_PROVIDER,
        "content": ODPT_CONTENT,
        "credit_form": ODPT_FAQ,
        "survey": {
            "file": ODPT_SURVEY,
            "url": ODPT_URLS[ODPT_SURVEY],
            "bytes": len(raw[ODPT_SURVEY]),
            "sha256": hashlib.sha256(raw[ODPT_SURVEY]).hexdigest(),
            "objects": len(survey),
            "years": years,
            "dc_dates": sorted({obj["dc:date"] for obj in survey}),
            "committed": "whole, byte for byte",
        },
        "titles": {
            "file": ODPT_TITLES,
            "cut": "the Japanese title of every railway and station the 乗降者数情報 names, each station's railway and its coordinates (geo:lat / geo:long)",
            "from": [
                {"file": name, "url": ODPT_URLS[name], "bytes": len(raw[name]), "sha256": hashlib.sha256(raw[name]).hexdigest()}
                for name in (ODPT_STATIONS_RAW, ODPT_RAILWAYS_RAW)
            ],
            "stations": len(titles["stations"]),
            "railways": len(titles["railways"]),
        },
    }
    (out_dir / ODPT_META).write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {out_dir / ODPT_SURVEY} ({len(survey)} objects, 年度 {years[0]}–{years[-1]}), {out_dir / ODPT_TITLES} and {out_dir / ODPT_META}")


# --- build ------------------------------------------------------------------------


def _figure(props: dict, year: int) -> int | None:
    """The row's 乗降客数 for ``year`` when this row carries it, else None."""
    if props[column(year, 0)] != DUP_THIS_ROW or props[column(year, 1)] != DATA_PRESENT:
        return None
    value = props[column(year, 3)]
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{props[NAME]} {props[OPERATOR]} {props[LINE]}: 乗降客数{year} {value!r}")
    return value


def _remark(props: dict, year: int) -> str | None:
    """The row's 備考 for ``year`` as S12 writes it, or None."""
    value = props[column(year, 2)]
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{props[NAME]} {props[OPERATOR]} {props[LINE]}: 備考{year} {value!r}")
    return value


def named_lines(remark: str, own_operator: str, operators: set[str]) -> list[tuple[str, str]]:
    """The lines a 「…を含む」 備考 names, each with its operator.

    「田園都市線、東京地下鉄・11号線半蔵門線、東京地下鉄・13号線副都心線を含む」
    → the row's own operator for 田園都市線, 東京地下鉄 for the other two;
    「東京都・10号線新宿線・12号線大江戸線」 is one operator with two lines;
    the pre-2022 punctuation 「東京都、6号線三田線」 is an operator, a comma,
    then its line. A 備考 that does not end in を含む names nothing.
    """
    if not remark.endswith(INCLUDES):
        return []
    out: list[tuple[str, str]] = []
    pending: str | None = None
    for item in remark[: -len(INCLUDES)].split("、"):
        tokens = item.split("・")
        if tokens[0] in operators and len(tokens) == 1:
            pending = tokens[0]
            continue
        if tokens[0] in operators:
            out += [(tokens[0], t) for t in tokens[1:]]
        else:
            out += [(pending or own_operator, t) for t in tokens]
        pending = None
    return out


def _short_line(line: str) -> str:
    """「5号線東西線」 → 「東西線」; other names as they are."""
    head, sep, tail = line.partition("号線")
    return tail if sep and head.isdigit() and tail else line


def _counted_elsewhere(members: list[dict], rows: list[dict], year: int, operators: set[str]) -> dict:
    """For a station every row of which says 他路線駅に記載: where S12 counts it.

    The target of a row is the figure row of the same S12 group whose 備考
    names the row's line (and operator). Either every row has one — the note
    names the ward and station — or none has and nothing is claimed.
    """
    targets: list[dict] = []
    unnamed = 0
    for m in members:
        mp = m["props"]
        found = [
            r
            for r in rows
            if r["props"][GROUP_CODE] == mp[GROUP_CODE]
            and _figure(r["props"], year) is not None
            and (mp[OPERATOR], mp[LINE]) in named_lines(_remark(r["props"], year) or "", r["props"][OPERATOR], operators)
        ]
        if not found:
            unnamed += 1
        for r in found:
            target = {
                "ward": r["ward"][1],
                "wardCode": r["ward"][0],
                "station": r["props"][NAME],
                "operator": r["props"][OPERATOR],
                "line": r["props"][LINE],
                "remark": _remark(r["props"], year),
            }
            if target not in targets:
                targets.append(target)
    if unnamed and targets:
        raise ValueError(f"{members[0]['props'][NAME]}: S12 names a counting row for some of the station's rows only")
    if not targets:
        return {"label": COUNTED_ELSEWHERE_UNNAMED, "targets": []}
    places: dict[tuple[str, str], list[str]] = defaultdict(list)
    for t in targets:
        places[(t["ward"], t["station"])].append(f"{NOTE_OPERATORS.get(t['operator'], t['operator'])}{_short_line(t['line'])}")
    note = "、".join(f"{ward}の{station}駅（{'、'.join(lines)}）" for (ward, station), lines in places.items())
    return {"label": COUNTED_ELSEWHERE, "targets": targets, "note": f"乗降客数は{note}に含まれます"}


def _trend(fixtures: Path, rows: list[dict], wards: list[dict], names: dict[str, str], year: int) -> tuple[dict, dict]:
    """乗降客数推移 from the committed panel: (the snapshot's ``trend``, its input record).

    ``rows`` are the snapshot's rows with their excerpt position (1-based).
    Checked here, so a panel that no longer fits the excerpt cannot build:
    the excerpt is the one the panel was written against; every row
    reference matches its feature; every row with a figure in ``year`` is in
    exactly one unit; a unit lies in one ward; every unit in the panel has a
    figure in every panel year; every excluded unit states a reason class.
    """
    panel = _load(fixtures / PANEL)
    excerpt_sha = sha256(fixtures / S12_EXCERPT)
    if panel["excerpt"]["sha256"] != excerpt_sha:
        raise ValueError(f"{PANEL}: written against excerpt {panel['excerpt']['sha256']}, the committed one is {excerpt_sha}")
    years, gap_years = panel["years"], panel["gapYears"]
    if years != sorted(set(years)) or years[-1] != year or not all(FIRST_YEAR <= y <= LAST_YEAR for y in years + gap_years):
        raise ValueError(f"{PANEL}: years {years}")
    if any(g in years or not years[0] < g < years[-1] for g in gap_years):
        raise ValueError(f"{PANEL}: gap years {gap_years}")

    by_feature = {r["feature"]: r for r in rows}
    seen: set[int] = set()
    units: list[dict] = []
    for u in panel["units"]:
        members = []
        for ref in u["rows"]:
            r = by_feature.get(ref["feature"])
            if r is None:
                raise ValueError(f"{PANEL}: feature {ref['feature']} is not a station row of the snapshot")
            p = r["props"]
            if (p[STATION_CODE], p[OPERATOR], p[LINE], p[NAME]) != (ref["code"], ref["operator"], ref["line"], ref["station"]):
                raise ValueError(f"{PANEL}: feature {ref['feature']} is {p[NAME]} {p[OPERATOR]} {p[LINE]}, not {ref}")
            if ref["feature"] in seen:
                raise ValueError(f"{PANEL}: feature {ref['feature']} in two units")
            seen.add(ref["feature"])
            if r["ward"][0] != u["wardCode"] or r["ward"][1] != u["ward"]:
                raise ValueError(f"{PANEL}: feature {ref['feature']} lies in {r['ward'][1]}, the unit says {u['ward']}")
            members.append(r)
        figures = {y: sum(v for v in (_figure(m["props"], y) for m in members) if v is not None) for y in years}
        if not figures[year]:
            raise ValueError(f"{PANEL}: a unit of {u['ward']} has no {year} figure")
        if u["in"]:
            if "reasons" in u or not all(figures[y] > 0 for y in years):
                raise ValueError(f"{PANEL}: a unit in the panel lacks a figure in one of {years}, or states a reason: {u['rows']}")
        else:
            reasons = u.get("reasons") or []
            if not reasons or any(c["class"] not in REASON_CLASSES or not c["years"] for c in reasons):
                raise ValueError(f"{PANEL}: an excluded unit states no reason class: {u['rows']}")
        units.append({"wardCode": u["wardCode"], "in": u["in"], "figures": figures, "members": members, "reasons": u.get("reasons")})
    missing = [r for r in rows if _figure(r["props"], year) is not None and r["feature"] not in seen]
    if missing:
        raise ValueError(f"{PANEL}: {len(missing)} rows with a {year} figure are in no unit, e.g. {missing[0]['props'][NAME]}")

    # The gap: the operators every panel row of which repeats the previous
    # year's value in the gap year — S12's own columns, nothing else.
    gaps = []
    for g in gap_years:
        both: dict[str, int] = defaultdict(int)
        same: dict[str, int] = defaultdict(int)
        for u in units:
            if not u["in"]:
                continue
            for m in u["members"]:
                a, b = _figure(m["props"], g - 1), _figure(m["props"], g)
                if a and b is not None:
                    both[m["props"][OPERATOR]] += 1
                    same[m["props"][OPERATOR]] += a == b
        repeating = [{"operator": op, "rows": n} for op, n in sorted(same.items(), key=lambda kv: -kv[1]) if n and n == both[op]]
        if not repeating:
            raise ValueError(f"{PANEL}: no operator repeats {g - 1} in {g} on every panel row — the gap has no reason in S12")
        who = "・".join(f"{r['operator']}{r['rows']}行すべて" for r in repeating)
        gaps.append(
            {
                "year": g,
                "repeating": repeating,
                "text": f"{g}年度は表示しません：国土数値情報の{g}年度の値が、パネルの{who}で前年度（{g - 1}年度）と同じ値のため",
            }
        )

    def view(code: str, name: str, mine: list[dict], passengers: int) -> dict:
        inside = [u for u in mine if u["in"]]
        series = [{"year": y, "passengers": sum(u["figures"][y] for u in inside)} for y in years]
        if sum(u["figures"][year] for u in mine) != passengers:
            raise ValueError(f"{PANEL}: the units of {name} sum to {sum(u['figures'][year] for u in mine)}, 日間乗降客 is {passengers}")
        return {
            "code": code,
            "name": name,
            "units": len(mine),
            "panelUnits": len(inside),
            "passengers": passengers,
            "panelPassengers": series[-1]["passengers"],
            "series": series,
        }

    views = [view(TOTAL_CODE, REGION, units, sum(w["passengers"] for w in wards))]
    views += [view(w["code"], names[w["code"]], [u for u in units if u["wardCode"] == w["code"]], w["passengers"]) for w in wards]
    excluded: dict[str, int] = defaultdict(int)
    for u in units:
        if not u["in"]:
            excluded[u["reasons"][0]["class"]] += 1
    trend = {
        "panel": {
            "id": panel["id"],
            "decided": panel["decided"],
            "units": len(units),
            "unitsIn": sum(1 for u in units if u["in"]),
            "excludedByFirstReason": {c: excluded[c] for c in REASON_CLASSES if excluded[c]},
        },
        "years": years,
        "gaps": gaps,
        "views": views,
    }
    record = {"path": f"backend/tests/fixtures/stations/{PANEL}", "sha256": sha256(fixtures / PANEL), "id": panel["id"], "decided": panel["decided"]}
    return trend, record


def _operator_figures(fixtures: Path, rows: list[dict], station_of: dict[tuple[str, str], dict], index: WardIndex, year: int) -> tuple[dict, dict]:
    """東京都交通局's own figure for every 都営 station-line of the 23 wards
    (follow-up 3): (the snapshot's ``operatorFigures``, its input records).

    Each object of the 乗降者数情報 — one line at one station — is matched to
    S12's 東京都 rows of the same line (S12's 「1号線浅草線」 is the センター's
    「浅草線」) and station name. Its latest 年度 goes to the station those rows
    belong to, with the rows' own S12 figure of the snapshot's year beside it
    (None where S12 writes the figure on another row). Nothing is added to
    any sum. Refused here, so a file that no longer fits cannot build: an
    object inside the 23 wards (by the センター's coordinates) that matches no
    row; a 東京都 row of a matched line that no object names; a station-line
    whose rows lie in two stations; two latest 年度 on one line.
    """
    meta = _load(fixtures / ODPT_META)
    if sha256(fixtures / ODPT_SURVEY) != meta["survey"]["sha256"]:
        raise ValueError(f"{ODPT_SURVEY} is not the file its meta was written for")
    survey, titles = _load(fixtures / ODPT_SURVEY), _load(fixtures / ODPT_TITLES)

    toei_rows = [r for r in rows if r["props"][OPERATOR] == TOEI_OPERATOR]
    line_of_short: dict[str, str] = {}
    for r in toei_rows:
        line = r["props"][LINE]
        if line_of_short.setdefault(_short_line(line), line) != line:
            raise ValueError(f"two 東京都 lines shorten to {_short_line(line)}")

    figures: list[dict] = []
    renamed: list[dict] = []
    outside: list[dict] = []
    latest_of_line: dict[str, int] = {}
    named: set[int] = set()
    for obj in sorted(survey, key=lambda o: o["owl:sameAs"]):
        station_id, railway_id = obj["odpt:station"][0], obj["odpt:railway"][0]
        station, railway = titles["stations"][station_id], titles["railways"][railway_id]["title"]
        if station["railway"] != railway_id:
            raise ValueError(f"{obj['owl:sameAs']}: station {station_id} is not on {railway_id}")
        by_year = {o["odpt:surveyYear"]: o["odpt:passengerJourneys"] for o in obj["odpt:passengerSurveyObject"]}
        latest = max(by_year)
        value = by_year[latest]
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError(f"{obj['owl:sameAs']}: {latest}年度 {value!r}")
        line = line_of_short.get(railway)
        matches = [r for r in toei_rows if r["props"][LINE] == line and _name_key(r["props"][NAME]) == _name_key(station["title"])]
        if not matches:
            if index.ward_of(station["lng"], station["lat"]) is not None:
                raise ValueError(f"{railway} {station['title']}: inside the 23 wards by its coordinates, but no 東京都 row of S12 matches it")
            outside.append({"line": railway, "station": station["title"], "id": obj["owl:sameAs"], "reason": "23区の外（公共交通オープンデータセンターの駅座標が23区のどの区ポリゴンにも入らない）"})
            continue
        if latest_of_line.setdefault(line, latest) != latest:
            raise ValueError(f"{line}: the latest 年度 is {latest_of_line[line]} at one station and {latest} at {station['title']}")
        homes = {id(station_of[(r["props"][GROUP_CODE], r["ward"][0])]) for r in matches}
        if len(homes) != 1:
            raise ValueError(f"{line} {station['title']}: its S12 rows lie in {len(homes)} stations")
        home = station_of[(matches[0]["props"][GROUP_CODE], matches[0]["ward"][0])]
        s12_name = matches[0]["props"][NAME]
        if s12_name != station["title"]:
            renamed.append({"line": line, "s12": s12_name, "odpt": station["title"]})
        own = [v for v in (_figure(r["props"], year) for r in matches) if v is not None]
        named.update(r["feature"] for r in matches)
        figures.append(
            {
                "home": home,
                "liner": railway == TOEI_LINER,
                "figure": {"operator": TOEI_OPERATOR, "line": line, "year": latest, "passengers": value, "s12": sum(own) if own else None},
                "rows": len(matches),
                "s12Rows": len(own),
            }
        )
    unnamed = [r for r in toei_rows if r["props"][LINE] in latest_of_line and r["feature"] not in named]
    if unnamed:
        raise ValueError(f"{len(unnamed)} 東京都 rows of S12 have no 乗降者数情報 object, e.g. {unnamed[0]['props'][LINE]} {unnamed[0]['props'][NAME]}")

    for f in figures:
        f["home"].setdefault("ownFigures", []).append(f["figure"])
    for st in {id(f["home"]): f["home"] for f in figures}.values():
        st["ownFigures"].sort(key=lambda g: g["line"])

    subway = [f for f in figures if not f["liner"]]
    liner = [f for f in figures if f["liner"]]
    subway_years, liner_years = {f["figure"]["year"] for f in subway}, {f["figure"]["year"] for f in liner}
    if len(subway_years) != 1 or len(liner_years) != 1:
        raise ValueError(f"the latest 年度: {TOEI_SUBWAY} {sorted(subway_years)}, {TOEI_LINER} {sorted(liner_years)}")
    subway_year, liner_year = subway_years.pop(), liner_years.pop()

    def below(group: list[dict]) -> int:
        """S12 rows carrying a figure of their own that is smaller than the 交通局 figure shown beside it."""
        return sum(f["s12Rows"] for f in group if f["figure"]["s12"] is not None and f["figure"]["s12"] < f["figure"]["passengers"])

    def with_own(group: list[dict]) -> int:
        return sum(f["s12Rows"] for f in group)

    below_subway, below_liner = below(subway), below(liner)
    notice = [
        "日間乗降客・事業者別・乗降客数推移・23区の中での位置の値は、国土数値情報（駅別乗降客数データ）の値で計算しています。",
        (
            f"{TOEI_SUBWAY}と{TOEI_LINER}の駅は、駅一覧に{TOEI_PUBLISHER}の公表値（{TOEI_SUBWAY} {subway_year}年度、{TOEI_LINER} {liner_year}年度）も併記しています。"
            f"{TOEI_SUBWAY}の公表値は路線ごとの値で、{TOEI_SUBWAY}の路線どうしの乗り換えは両方の路線で数えられています。"
        ),
        (
            f"国土数値情報の{year}年度の値が、併記した{TOEI_PUBLISHER}の公表値より小さい行は{below_subway + below_liner}行です"
            f"（{TOEI_SUBWAY}{below_subway}行、{TOEI_LINER}{below_liner}行）。"
        ),
    ]
    block = {
        "publisher": TOEI_PUBLISHER,
        "provider": ODPT_PROVIDER,
        "content": ODPT_CONTENT,
        "retrieved": meta["retrieved"],
        "years": [{"name": TOEI_SUBWAY, "year": subway_year}, {"name": TOEI_LINER, "year": liner_year}],
        "stationLines": len(figures),
        "stations": len({id(f["home"]) for f in figures}),
        "s12Rows": {"matched": len(named), "withOwnFigure": with_own(figures)},
        "below": {"rows": below_subway + below_liner, "subway": below_subway, "liner": below_liner, "s12Year": year},
        "notice": notice,
        "transfersBasis": {"quote": TOEI_TRANSFERS_QUOTE, "url": TOEI_TRANSFERS_PAGE, "read": "2026-11-09"},
        "matching": {
            "rule": "路線は S12 の路線名から「N号線」を除いた名と公共交通オープンデータセンターの路線名の一致、駅は駅名の一致（全角半角・「ヶ」と「ケ」・空白の違いのみ同一視）",
            "objects": len(survey),
            "matched": len(figures),
            "renamed": renamed,
            "outsideWards": outside,
            "unmatchedInsideWards": [],
            "s12RowsWithoutObject": [],
            "linesWithoutObjects": sorted({r["props"][LINE] for r in toei_rows} - set(latest_of_line)),
        },
    }
    inputs = {
        ODPT_SURVEY: {"path": f"backend/tests/fixtures/stations/{ODPT_SURVEY}", "sha256": sha256(fixtures / ODPT_SURVEY), "cut_from": {**meta["survey"], **{k: meta[k] for k in ("retrieved", "endpoint", "catalog", "licence", "licence_url", "provider", "content", "credit_form")}}},
        ODPT_TITLES: {"path": f"backend/tests/fixtures/stations/{ODPT_TITLES}", "sha256": sha256(fixtures / ODPT_TITLES), "cut_from": {**meta["titles"], "retrieved": meta["retrieved"]}},
    }
    return block, inputs


def build(fixtures: Path = FIXTURES) -> dict:
    meta = json.loads((fixtures / META).read_text(encoding="utf-8"))
    n03, s12 = _load(fixtures / N03_EXCERPT), _load(fixtures / S12_EXCERPT)
    index = WardIndex(n03["features"])
    year = S12_YEAR

    rows: list[dict] = []
    straddling: list[dict] = []
    dropped: list[dict] = []
    operator_names = {f["properties"][OPERATOR] for f in s12["features"]}
    for position, f in enumerate(s12["features"], start=1):
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
        rows.append({"props": p, "ward": ward, "point": (round(x, 6), round(y, 6)), "feature": position})

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
        # Each figure row's 備考 of the year, as S12 writes it (real-data plan
        # PR 4b): what else the row's figure contains.
        remarks = [
            {"operator": r["props"][OPERATOR], "line": r["props"][LINE], "text": _remark(r["props"], year)}
            for r in members
            if _figure(r["props"], year) is not None and _remark(r["props"], year)
        ]
        if remarks:
            station["remarks"] = remarks
        if not known and all(r["props"][column(year, 0)] == DUP_OTHER_ROW for r in members):
            # Every row says 他路線駅に記載: S12 counts this station on another
            # row (another group, or the same group across a ward boundary).
            # The row whose 備考 names it says where; without one nothing is claimed.
            elsewhere = _counted_elsewhere(members, rows, year, operator_names)
            note = elsewhere.pop("note", None)
            station["countedElsewhere"] = elsewhere
            if note:
                station["note"] = note
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
                if st.get("remarks"):
                    raise ValueError(f"{name}: a folded group carries a 備考")
                folded.add(st["code"] + "/" + ward_code)
    # Which station a row's (group, ward) ended up in — itself, or the one it was folded into.
    station_of: dict[tuple[str, str], dict] = {(st["code"], st["wardCode"]): st for st in stations}
    for m in merged:
        ward_code = next(st["wardCode"] for st in stations if st["code"] == m["into"] and st["ward"] == m["ward"])
        station_of[(m["code"], ward_code)] = station_of[(m["into"], ward_code)]
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

    trend, panel_input = _trend(fixtures, rows, wards, index.names, year)
    # 東京都交通局's own figures, shown beside S12's (follow-up 3): attached to the
    # stations after every sum above is fixed, so no sum can take them in.
    operator_figures, operator_inputs = _operator_figures(fixtures, rows, station_of, index, year)
    subway_year, liner_year = (y["year"] for y in operator_figures["years"])

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
            "trend": {
                "year": year,
                "table": S12_ID,
                "label": (
                    f"国土数値情報 駅別乗降客数データ {S12_EDITION} "
                    + "・".join(f"乗降客数{y}" for y in trend["years"])
                    + "（1日平均、人/日）— 全年度を同じ基準で比べられる行の合計"
                ),
            },
            # Shown beside S12's figure in 駅一覧, in no sum (follow-up 3). `year` is the 都営地下鉄 年度.
            "operatorFigures": {
                "year": subway_year,
                "table": ODPT_TABLE,
                "label": f"{ODPT_CONTENT}（公共交通オープンデータセンター）1日平均乗降人員：{TOEI_SUBWAY} {subway_year}年度・{TOEI_LINER} {liner_year}年度",
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
            PANEL: panel_input,
            **operator_inputs,
        },
        "licence": LICENCE,
        "credit": CREDIT,
        "notes": NOTES,
        "straddlingRows": straddling,
        "droppedRows": dropped,
        "mergedGroups": merged,
        "wards": wards,
        "trend": trend,
        "operatorFigures": operator_figures,
        "stations": stations,
    }


def main(argv: list[str]) -> int:
    if argv[1:] == ["extract"]:
        extract()
    elif argv[1:] == ["extract-toei"]:
        extract_toei()
    elif argv[1:] == ["build"]:
        snapshot = build()
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(
            f"wrote {SNAPSHOT} ({len(snapshot['stations'])} stations in {len(snapshot['wards'])} wards, "
            f"{len(snapshot['straddlingRows'])} straddling rows, {len(snapshot['droppedRows'])} dropped, {len(snapshot['mergedGroups'])} merged; "
            f"東京都交通局の公表値 {snapshot['operatorFigures']['stationLines']} station-lines at {snapshot['operatorFigures']['stations']} stations, "
            f"S12 below it at {snapshot['operatorFigures']['below']['rows']} rows)"
        )
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
