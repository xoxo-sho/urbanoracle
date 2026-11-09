"""公園・農地・森林など — the land-use green share of the 23 特別区 (real-data plan PR 8,
RECON 2026-10-uo-real-data §9 row 8, Architect decision 6 of 2026-11-09).

Two steps, nothing typed by hand, nothing beyond the standard library:

  extract   the raw CSV (git-ignored download under etl/_downloads/) →
            backend/tests/fixtures/green/tochi_r3_01.csv, committed whole and
            byte for byte, with a sidecar meta (URL, size, sha256, licence evidence)
  build     the committed CSV → backend/data/green_land_use.json, the snapshot
            GET /api/v1/green-land-use serves

Source
------------------------------------------------------------------------------
東京都都市整備局「東京の土地利用 令和３年東京都区部」（土地利用現況調査）,
「（表－１）令和３年土地面積（区部・区別）」 — tochi_r3_01.csv (cp932). Header row:
地域, Area, 合計（ha）, L-1／宅地（ha）, L-2／その他（ha）, L-2／（屋外利用地）／内数（ha）,
L-3／公園等（ha）, L-4／未利用地等（ha）, L-5／道路等（ha）, L-5／（道路）／内数（ha）,
L-6／農用地（ha）, L-7／水面・河川・水路（ha）, L-8／森林（ha）, L-9／原野（ha）.
Rows: 区部（R3）, 区部（H28）, the 23 wards, 中央防波堤.

Licence: on the 東京都オープンデータAPIカタログ page of the dataset
(https://spec.api.metro.tokyo.lg.jp/spec/t000008d2000000016-d6caababf14359878916424ed55bc222-0?lang=ja,
read 2026-11-05): 「ライセンス クリエイティブ・コモンズ 表示（CC BY）」, 実データ
…/seisaku/tochi_c/pdf/tochi_r3/tochi_r3_01.csv (which 301-redirects to the file
committed here, same sha256). 東京都オープンデータ利用規約
(https://portal.data.metro.tokyo.lg.jp/terms/) prescribes the credit and, for a
modified use, the 改変 sentence; §3 makes these terms prevail over the bureau
site's policy. The catalog page itself answers 403 from here (geo-blocked).

Metric (decision 6): per ward, (公園等 + 農用地 + 森林 + 原野) ÷ the survey's own
ward total 合計（ha）. The 23区 figure is the same over the 23 ward rows summed —
not the CSV's 区部（R3） row, which also counts 中央防波堤 (287.7 ha, assigned to
no ward). It is land use, not green cover: 公園等 is land the survey classes
as parks; street trees and gardens are not in it.

Run (from the repo root, with -I):

  python -I etl/green.py extract
  python -I etl/green.py build
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOWNLOAD = ROOT / "etl" / "_downloads" / "tokyo_tochi_r3" / "tochi_r3_01.csv"
FIXTURES = ROOT / "backend" / "tests" / "fixtures" / "green"
CSV_NAME = "tochi_r3_01.csv"
META = "meta.json"
SNAPSHOT = ROOT / "backend" / "data" / "green_land_use.json"

URL = "https://www.toshiseibi.metro.tokyo.lg.jp/seisaku/tochi_c/pdf/tochi_r3/tochi_r3_01.csv"
SERVED_AT = "https://www.toshiseibi.metro.tokyo.lg.jp/documents/d/toshiseibi/csv_seisaku_tochi_c_pdf_tochi_r3_tochi_r3_01"
SHA256 = "dc807361a6613a514d1c0384ad89146d1fb990d55e27440f0877e0b762b114b7"
INDEX = "https://www.toshiseibi.metro.tokyo.lg.jp/about/chousa/tochi_c/tochi_kekka_r3/list"
API_PAGE = "https://spec.api.metro.tokyo.lg.jp/spec/t000008d2000000016-d6caababf14359878916424ed55bc222-0?lang=ja"
CATALOG = "https://catalog.data.metro.tokyo.lg.jp/dataset/t000008d2000000016"
TERMS = "https://portal.data.metro.tokyo.lg.jp/terms/"
CC_BY_JA = "https://creativecommons.org/licenses/by/4.0/deed.ja"
TITLE = "東京の土地利用 令和３年東京都区部（表－１）令和３年土地面積（区部・区別）"
YEAR = 2021

HEADER = [
    "地域", "Area", "合計（ha）", "L-1／宅地（ha）", "L-2／その他（ha）", "L-2／（屋外利用地）／内数（ha）",
    "L-3／公園等（ha）", "L-4／未利用地等（ha）", "L-5／道路等（ha）", "L-5／（道路）／内数（ha）",
    "L-6／農用地（ha）", "L-7／水面・河川・水路（ha）", "L-8／森林（ha）", "L-9／原野（ha）",
]
TOTAL_COLUMN = "合計（ha）"
# The four classes decision 6 counts, as the CSV names them.
CLASSES = [
    ("park", "L-3／公園等（ha）", "公園等"),
    ("farm", "L-6／農用地（ha）", "農用地"),
    ("forest", "L-8／森林（ha）", "森林"),
    ("wild", "L-9／原野（ha）", "原野"),
]
LABEL = "公園等・農用地・森林・原野の面積割合"

WARD_NAMES = {
    "13101": "千代田区", "13102": "中央区", "13103": "港区", "13104": "新宿区", "13105": "文京区",
    "13106": "台東区", "13107": "墨田区", "13108": "江東区", "13109": "品川区", "13110": "目黒区",
    "13111": "大田区", "13112": "世田谷区", "13113": "渋谷区", "13114": "中野区", "13115": "杉並区",
    "13116": "豊島区", "13117": "北区", "13118": "荒川区", "13119": "板橋区", "13120": "練馬区",
    "13121": "足立区", "13122": "葛飾区", "13123": "江戸川区",
}
TOTAL_CODE = "13100"
REGION = "東京23区"
OTHER_ROWS = ["区部（R3）", "区部（H28）", "中央防波堤"]

CREDIT = {
    # 東京都オープンデータ利用規約 2(1)ア / イ, in the form the terms prescribe.
    "tokyo": f"{TITLE}、東京都、クリエイティブ・コモンズ・ライセンス 表示4.0国際（{CC_BY_JA}）",
    "tokyo_edited": f"このサービスは、以下の著作物を改変して利用しています。{TITLE}、東京都、クリエイティブ・コモンズ・ライセンス 表示4.0国際（{CC_BY_JA}）",
}
LICENCE = {
    "name": "クリエイティブ・コモンズ・ライセンス 表示4.0国際（CC BY 4.0）— 東京都オープンデータ利用規約",
    "url": TERMS,
    "basis": (
        f"東京都オープンデータAPIカタログの当該データセットのページ（{API_PAGE}）が「ライセンス クリエイティブ・コモンズ 表示（CC BY）」と記し、"
        f"「実データ」として {URL} を指す（2026-11-05 直接読了。この URL は {SERVED_AT} へ 301 で転送され、同じ sha256 のファイル）。"
        f"東京都オープンデータ利用規約（{TERMS}）第3項により、同局サイトポリシーの「無断で複製・転用することはできません」よりこの規約が優先する。"
        f"カタログ本体（{CATALOG}）はこの環境から HTTP 403（地域制限）で読めず、API カタログのページで読んだ。"
    ),
}
NOTES = {
    "share": "区ごとに（公園等＋農用地＋森林＋原野）÷ 合計（ha）。合計は調査の区別土地面積",
    "total": "23区の値は23区の行の合計から計算（CSV の「区部（R3）」行は中央防波堤 287.7 ha を含むため使わない）",
    "definition": "土地利用現況調査の土地利用区分による面積。緑被（樹木・草地の被覆）ではなく、街路樹や庭は含まない",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract(today: date | None = None) -> None:
    if sha256(DOWNLOAD) != SHA256:
        raise ValueError(f"{DOWNLOAD}: sha256 is not the pinned {SHA256}")
    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / CSV_NAME).write_bytes(DOWNLOAD.read_bytes())
    meta = {
        "fetched": (today or date.today()).isoformat(),
        "title": TITLE,
        "url": URL,
        "served_at": SERVED_AT,
        "index": INDEX,
        "api_page": API_PAGE,
        "catalog": CATALOG,
        "file": CSV_NAME,
        "bytes": DOWNLOAD.stat().st_size,
        "sha256": SHA256,
        "encoding": "cp932",
        "committed": "whole, byte for byte",
        "licence_evidence": {"api_page_licence": "クリエイティブ・コモンズ 表示（CC BY）", "api_page_created": "2023/09/27 02:34:00", "catalog_status": 403},
    }
    (FIXTURES / META).write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {FIXTURES / CSV_NAME} and {FIXTURES / META}")


def read_rows(fixtures: Path = FIXTURES) -> dict[str, dict]:
    path = fixtures / CSV_NAME
    if sha256(path) != SHA256:
        raise ValueError(f"{path}: sha256 is not the pinned {SHA256}")
    rows = list(csv.reader(io.StringIO(path.read_bytes().decode("cp932"))))
    if rows[0] != HEADER:
        raise ValueError(f"header {rows[0]} is not the pinned one")
    out = {}
    for r in rows[1:]:
        if not r:
            continue
        rec = dict(zip(HEADER, r, strict=True))
        out[rec["地域"].strip()] = rec
    names = set(WARD_NAMES.values())
    if not names <= set(out) or set(out) - names != set(OTHER_ROWS):
        raise ValueError(f"rows are not the 23 wards plus {OTHER_ROWS}: {sorted(out)}")
    return out


def _record(code: str, name: str, totals: dict) -> dict:
    total = round(totals[TOTAL_COLUMN], 1)
    classes = [{"key": key, "name": label, "ha": round(totals[column], 1)} for key, column, label in CLASSES]
    green = round(sum(c["ha"] for c in classes), 1)
    if not 0 <= green <= total:
        raise ValueError(f"{name}: green {green} outside the total {total}")
    return {"code": code, "name": name, "totalHa": total, "greenHa": green, "share": round(green / total * 100, 4), "classes": classes}


def build(fixtures: Path = FIXTURES) -> dict:
    meta = json.loads((fixtures / META).read_text(encoding="utf-8"))
    rows = read_rows(fixtures)
    columns = [TOTAL_COLUMN] + [c for _, c, _ in CLASSES]
    wards = []
    sums = {c: 0.0 for c in columns}
    for code, name in WARD_NAMES.items():
        values = {c: float(rows[name][c]) for c in columns}
        for c in columns:
            sums[c] += values[c]
        wards.append(_record(code, name, values))
    total = _record(TOTAL_CODE, REGION, sums)
    return {
        "region": REGION,
        "year": YEAR,
        "sources": {
            "green": {"year": YEAR, "table": "土地利用現況調査 令和3年 表－1", "label": f"東京都都市整備局「{TITLE}」公園等・農用地・森林・原野（令和3年）"},
        },
        "label": LABEL,
        "classes": [{"key": k, "column": c, "name": n} for k, c, n in CLASSES],
        "totalColumn": TOTAL_COLUMN,
        "inputs": {CSV_NAME: {"path": f"backend/tests/fixtures/green/{CSV_NAME}", "sha256": SHA256, "cut_from": meta}},
        "licence": LICENCE,
        "credit": CREDIT,
        "notes": NOTES,
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
        t = snapshot["total"]
        print(f"wrote {SNAPSHOT} (23区 {t['greenHa']} ha of {t['totalHa']} ha = {t['share']:.2f} %)")
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
