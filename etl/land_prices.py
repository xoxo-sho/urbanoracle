"""地価 snapshot for the 23 特別区 (real-data plan PR 5, RECON 2026-10-uo-real-data §9 row 5).

Two steps, both deterministic, nothing typed by hand, nothing beyond the
standard library:

  extract   the raw 国土数値情報 L01 zip (git-ignored download)
            → a committed excerpt under backend/tests/fixtures/land_prices/
              (the 23-ward rows as CSV, the attributes the builder reads, and
              a sidecar meta with URL, size, sha256 and edition of the zip)
  build     committed excerpt → backend/data/land_prices.json (the snapshot
            /api/v1/land-prices serves)

Source (Architect decision 4, 2026-11-02: L01 地価公示 only, the 東京都 extract;
都道府県地価調査 L02 is not used)
------------------------------------------------------------------------------
L01  国土数値情報 地価公示データ 2026年（令和8年）版, L01-26_13_GML.zip
     (https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L01-2026.html,
     更新履歴「2026年3月：2026年（令和8年）版に更新しました。」, 2026年1月1日時点).
     One Point row per 標準地 with, among 148 attributes, L01_001 行政区域コード,
     L01_002 用途区分 (codelist L01_v4_0_IndexNumberCodeType: 000 住宅地,
     003 宅地見込地, 005 商業地, 009 工業地, 013 林地), L01_003 連番, L01_007 年度,
     L01_008 地価公示価格 (円/m²), L01_009 対前年変動率 (%, 「継続する標準地に
     ついて前年の地価公示価格との対比から算出」, 小数点以下第2位を四捨五入),
     L01_010 選定状況 (codelist L01_v4_0_SelectLandStatusCodeType: 1 継続,
     2 基準地番号変更, 4 新設・選定替えで当該年追加, 5 隔年調査（休止）地点),
     L01_060 共通地点, and the yearly prices L01_062 … L01_105 (昭和58年 … 令和8年).

Definitions (Architect decision 4): per ward and per use —
  price   = the simple mean of L01_008 over ALL points of that use
            (every point: 継続, 新設 and 隔年調査 alike)
  change  = the simple mean of L01_009 over the 継続 points (L01_010 = 1)
            of that use; a point without a previous year carries no change
These are the definitions behind the 区市町村別用途別平均価格表 and the
区市町村別用途別対前年変動率 the 東京都財務局 publishes for the same edition
(verified outside the repo, 2026-11-02; nothing from those PDFs is in here).
住宅地 (000) and 商業地 (005) get a series; 工業地 (009) gets its point count
only. Every figure carries its point count n.

Licence: 「2019年（平成31年）以降：オープンデータ（CC_BY_4.0）」 under the 国土数値情報
利用規約 (https://nlftp.mlit.go.jp/ksj/other/agreement.html); credit in the
加工 form with no editor name (Architect decision 12), carried in the snapshot.

Run (from the repo root, with -I so nothing in the download dir is imported):

  python -I etl/land_prices.py extract
  python -I etl/land_prices.py build
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = ROOT / "etl" / "_downloads"
FIXTURES = ROOT / "backend" / "tests" / "fixtures" / "land_prices"
SNAPSHOT = ROOT / "backend" / "data" / "land_prices.json"

KSJ_SITE = "https://nlftp.mlit.go.jp/ksj/"
KSJ_TERMS = "https://nlftp.mlit.go.jp/ksj/other/agreement.html"

# --- L01 地価公示 -----------------------------------------------------------------

L01_ID = "L01-26"
L01_EDITION = "2026年（令和8年）版"
L01_YEAR = 2026
L01_REFERENCE_DATE = "2026-01-01"
L01_REFERENCE_JA = "2026年1月1日時点"
L01_PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L01-2026.html"
L01_ZIP_URL = "https://nlftp.mlit.go.jp/ksj/gml/data/L01/L01-26/L01-26_13_GML.zip"
L01_ZIP = "L01-26_13_GML.zip"
L01_GEOJSON = Path("L01-26_13_GML") / "L01-26_13.geojson"
L01_DOWNLOAD_DIR = DOWNLOADS / "ksj_L01-26_13"
L01_EXCERPT = "ksj_L01-26_tokyo23.csv"
META = "ksj.meta.json"

# Attribute layout (the datalist page, 2026-11-02).
CODE, USE, SEQ, YEAR, PRICE, CHANGE, STATUS, COMMON = "L01_001", "L01_002", "L01_003", "L01_007", "L01_008", "L01_009", "L01_010", "L01_060"
PREVIOUS_PRICE, CURRENT_PRICE = "L01_104", "L01_105"  # 令和7年 / 令和8年 公示価格 (L01_062 = 昭和58年)
USE_RESIDENTIAL, USE_COMMERCIAL, USE_INDUSTRIAL = "000", "005", "009"
STATUS_CONTINUING = 1

USES = {"residential": USE_RESIDENTIAL, "commercial": USE_COMMERCIAL}
USE_JA = {"residential": "住宅地", "commercial": "商業地", "industrial": "工業地"}
EXCERPT_COLUMNS = ["code", "ward", "use", "seq", "year", "price", "change", "status", "previous_price", "common", "lon", "lat"]

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

REGION = "東京23区"
LICENCE = {
    "name": "国土数値情報 利用規約（PDL1.0準拠）— 地価公示データ 2019年（平成31年）以降は「オープンデータ（CC_BY_4.0）」",
    "url": KSJ_TERMS,
}
CREDIT = {
    "source": f"出典：国土交通省国土数値情報ダウンロードサイト（{KSJ_SITE}）",
    "edited_l01": f"「国土数値情報（地価公示データ）」（国土交通省）（{KSJ_SITE}）を加工して作成",
    "pages": {"L01": L01_PAGE},
}
NOTES = {
    "price": "平均価格は各用途の全地点の地価公示価格の単純平均",
    "change": "変動率は継続地点（前年と比較できる地点）の対前年変動率の単純平均",
    "uses": "住宅地と商業地のみ区別に集計（用途区分 000 住宅地、005 商業地）；工業地は地点数のみ",
    "definition_source": (
        "東京都財務局の区市町村別用途別平均価格表・対前年変動率表と同じ定義（全地点の単純平均・継続地点の単純平均）"
    ),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _int(value, where: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{where}: expected an integer, got {value!r}")
    return value


def _real(value, where: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{where}: expected a finite number, got {value!r}")
    return float(value)


# --- extract ----------------------------------------------------------------------


def extract(out_dir: Path = FIXTURES, today: date | None = None) -> None:
    zip_path = L01_DOWNLOAD_DIR / L01_ZIP
    geojson = _load(L01_DOWNLOAD_DIR / L01_GEOJSON)
    kept: list[dict] = []
    for f in geojson["features"]:
        p = f["properties"]
        code = p.get(CODE)
        if not isinstance(code, str) or code not in WARD_NAMES:
            continue
        if f["geometry"]["type"] != "Point":
            raise ValueError(f"{code}-{p.get(USE)}-{p.get(SEQ)}: geometry {f['geometry']['type']}")
        where = f"{code}-{p[USE]}-{p[SEQ]}"
        if _int(p[PRICE], f"{where} {PRICE}") != _int(p[CURRENT_PRICE], f"{where} {CURRENT_PRICE}"):
            raise ValueError(f"{where}: {PRICE} {p[PRICE]} != {CURRENT_PRICE} {p[CURRENT_PRICE]}")
        if _int(p[YEAR], f"{where} {YEAR}") != L01_YEAR:
            raise ValueError(f"{where}: {YEAR} {p[YEAR]} != {L01_YEAR}")
        lon, lat = f["geometry"]["coordinates"]
        kept.append(
            {
                "code": code,
                "ward": WARD_NAMES[code],
                "use": str(p[USE]),
                "seq": str(p[SEQ]),
                "year": p[YEAR],
                "price": p[PRICE],
                "change": _real(p[CHANGE], f"{where} {CHANGE}"),
                "status": _int(p[STATUS], f"{where} {STATUS}"),
                "previous_price": _int(p[PREVIOUS_PRICE], f"{where} {PREVIOUS_PRICE}"),
                "common": _int(p[COMMON], f"{where} {COMMON}"),
                "lon": lon,
                "lat": lat,
            }
        )
    kept.sort(key=lambda r: (r["code"], r["use"], r["seq"]))

    out_dir.mkdir(parents=True, exist_ok=True)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=EXCERPT_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(kept)
    (out_dir / L01_EXCERPT).write_text(buf.getvalue(), encoding="utf-8")
    meta = {
        "fetched": (today or date.today()).isoformat(),
        "L01": {
            "id": L01_ID,
            "title": "国土数値情報 地価公示データ（東京都）",
            "edition": L01_EDITION,
            "year": L01_YEAR,
            "reference_date": L01_REFERENCE_DATE,
            "page": L01_PAGE,
            "url": L01_ZIP_URL,
            "file": L01_ZIP,
            "bytes": zip_path.stat().st_size,
            "sha256": sha256(zip_path),
            "published": "2026-03（更新履歴「2026年3月：2026年（令和8年）版に更新しました。」）",
            "licence": "オープンデータ（CC_BY_4.0）（2019年（平成31年）以降）",
            "rows_total": len(geojson["features"]),
            "rows_kept": len(kept),
            "cut": (
                "rows whose L01_001 is 13101–13123, as CSV: code (L01_001), use (L01_002), seq (L01_003), "
                "year (L01_007), price (L01_008 = L01_105 令和8年公示価格, 円/m²), change (L01_009 対前年変動率, %), "
                "status (L01_010 選定状況), previous_price (L01_104 令和7年公示価格), common (L01_060), lon, lat"
            ),
            "codes": {
                "use": {"000": "住宅地", "003": "宅地見込地", "005": "商業地", "009": "工業地", "013": "林地"},
                "status": {"1": "継続", "2": "基準地番号変更", "4": "新設・選定替えで当該年追加", "5": "隔年調査（休止）地点"},
            },
        },
    }
    (out_dir / META).write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {out_dir / L01_EXCERPT} ({len(kept)} rows) and {out_dir / META}")


# --- build ------------------------------------------------------------------------


def read_excerpt(fixtures: Path = FIXTURES) -> list[dict]:
    rows = list(csv.DictReader((fixtures / L01_EXCERPT).read_text(encoding="utf-8").splitlines()))
    out = []
    for r in rows:
        out.append(
            {
                "code": r["code"],
                "ward": r["ward"],
                "use": r["use"],
                "seq": r["seq"],
                "year": int(r["year"]),
                "price": int(r["price"]),
                "change": float(r["change"]),
                "status": int(r["status"]),
                "previous_price": int(r["previous_price"]),
                "common": int(r["common"]),
                "lon": float(r["lon"]),
                "lat": float(r["lat"]),
            }
        )
    return out


def figures(rows: list[dict]) -> dict:
    """One use in one ward: n, the simple mean price over every point, and the
    simple mean change over the 継続 points (None when none continues)."""
    prices = [r["price"] for r in rows]
    continuing = [r["change"] for r in rows if r["status"] == STATUS_CONTINUING]
    return {
        "n": len(prices),
        "meanPrice": round(sum(prices) / len(prices)) if prices else None,
        "minPrice": min(prices) if prices else None,
        "maxPrice": max(prices) if prices else None,
        "nContinuing": len(continuing),
        "meanChange": round(sum(continuing) / len(continuing), 4) if continuing else None,
    }


def build(fixtures: Path = FIXTURES) -> dict:
    meta = _load(fixtures / META)
    rows = read_excerpt(fixtures)
    year = meta["L01"]["year"]
    if any(r["year"] != year for r in rows):
        raise ValueError("excerpt rows are not all of the edition's year")
    other_uses = sorted({r["use"] for r in rows} - {USE_RESIDENTIAL, USE_COMMERCIAL, USE_INDUSTRIAL})
    if other_uses:
        raise ValueError(f"unexpected 用途区分 in the 23 wards: {other_uses}")

    wards = []
    for code in WARD_CODES:
        mine = [r for r in rows if r["code"] == code]
        if not mine:
            raise ValueError(f"{code} {WARD_NAMES[code]}: no point")
        ward = {"code": code, "name": WARD_NAMES[code], "n": len(mine)}
        for use, use_code in USES.items():
            ward[use] = figures([r for r in mine if r["use"] == use_code])
            if ward[use]["n"] == 0:
                raise ValueError(f"{WARD_NAMES[code]}: no {USE_JA[use]} point")
        ward["industrial"] = {"n": sum(1 for r in mine if r["use"] == USE_INDUSTRIAL)}
        wards.append(ward)

    total = {"n": len(rows)}
    for use, use_code in USES.items():
        total[use] = figures([r for r in rows if r["use"] == use_code])
    total["industrial"] = {"n": sum(1 for r in rows if r["use"] == USE_INDUSTRIAL)}

    reference = f"{meta['L01']['edition']} 地価公示（{L01_REFERENCE_JA}）"
    return {
        "region": REGION,
        "year": year,
        "referenceDate": meta["L01"]["reference_date"],
        "reference": reference,
        "sources": {
            "price": {
                "year": year,
                "table": meta["L01"]["id"],
                "label": f"国土数値情報 地価公示データ {meta['L01']['edition']} 地価公示価格（{L01_REFERENCE_JA}、円/m²）",
            },
            "change": {
                "year": year,
                "table": meta["L01"]["id"],
                "label": f"国土数値情報 地価公示データ {meta['L01']['edition']} 対前年変動率（{year - 1}年1月1日→{year}年1月1日、%）",
            },
        },
        "inputs": {
            L01_EXCERPT: {
                "path": f"backend/tests/fixtures/land_prices/{L01_EXCERPT}",
                "sha256": sha256(fixtures / L01_EXCERPT),
                "cut_from": meta["L01"],
            }
        },
        "licence": LICENCE,
        "credit": CREDIT,
        "notes": NOTES,
        "uses": {use: {"code": code, "label": USE_JA[use]} for use, code in USES.items()},
        "total": total,
        "wards": wards,
    }


def main(argv: list[str]) -> int:
    if argv[1:] == ["extract"]:
        extract()
    elif argv[1:] == ["build"]:
        snapshot = build()
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(
            f"wrote {SNAPSHOT} ({snapshot['total']['n']} points in {len(snapshot['wards'])} wards: "
            f"住宅地 {snapshot['total']['residential']['n']}, 商業地 {snapshot['total']['commercial']['n']}, "
            f"工業地 {snapshot['total']['industrial']['n']})"
        )
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
