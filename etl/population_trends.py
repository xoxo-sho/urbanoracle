"""人口推移 snapshot for the 23 特別区 (real-data plan PR 3, RECON 2026-10-uo-real-data §9 row 3).

Two steps, both deterministic, nothing typed by hand:

  extract   raw e-Stat 時系列 workbook (git-ignored download)
            → committed excerpt CSV + sidecar meta (sha256, URL, dates)
  build     committed excerpt + the committed 2025 確報 e-Stat responses
            → backend/data/population_trends.json (the snapshot the route serves)

Sources
-------
2000 / 2005 / 2010 / 2015 / 2020
  国勢調査 時系列データ 男女，年齢，配偶関係 第6表 年齢（3区分），男女別人口及び
  年齢別割合 － 都道府県，市区町村（昭和55年～令和2年）: 東京都, e-Stat
  statInfId 000001085987 (EXCEL, 公開 2022-03-31), one sheet per census year.
  Each sheet is that census as enumerated; for the 23 wards the 特別区部 row
  equals the sum of the wards in every year used, and the 令和2年 sheet equals
  the 2025 確報 table's 2020年（組替） for every ward — asserted below.
2025
  令和7年国勢調査 人口等基本集計（確報）男女別人口, e-Stat statsDataId
  0004065881 (公表 2026-09-29), the raw API response committed for PR 2
  under backend/tests/fixtures/census_2025/ (Architect decision 2026-11-01:
  the 確報, no new fetch).
cross-check only
  0004065882 tab 2025_03 (2020年（組替）) and 2025_34 (5年間の人口増減数).

Licence: e-Stat 利用規約 (政府標準利用規約（第2.0版）準拠, CC BY 4.0 互換);
credit 「出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）」 and the
加工 statement carried in the snapshot.

Run (from the repo root, with -I so nothing in the download dir is imported):

  python -I etl/population_trends.py extract   # needs openpyxl (etl/requirements.txt)
  python -I etl/population_trends.py build
"""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = ROOT / "etl" / "_downloads" / "estat_000001085987"
FIXTURES = ROOT / "backend" / "tests" / "fixtures"
TREND_FIXTURES = FIXTURES / "population_trends"
CENSUS_FIXTURES = FIXTURES / "census_2025"
SNAPSHOT = ROOT / "backend" / "data" / "population_trends.json"

# --- the 時系列 workbook -------------------------------------------------------

STAT_INF_ID = "000001085987"
RAW_FILE = "da0613.xlsx"  # the name e-Stat's Content-Disposition gives the download
RAW_URL = f"https://www.e-stat.go.jp/stat-search/file-download?statInfId={STAT_INF_ID}&fileKind=0"
LISTING_URL = "https://www.e-stat.go.jp/stat-search/files?tclass=000001007702&cycle=0&layout=datalist"
TITLE = "国勢調査 時系列データ 男女，年齢，配偶関係 第6表 年齢（3区分），男女別人口及び年齢別割合 － 都道府県，市区町村（昭和55年～令和2年）：東京都"
OPEN_DATE = "2022-03-31"
EXCERPT = f"estat_{STAT_INF_ID}_tokyo23.csv"
META = f"estat_{STAT_INF_ID}.meta.json"

# sheet name -> census year. The 原数値 sheets carry the enumerated totals;
# the 不詳補完値 sheets (2015, 2020) have the same totals and are not read.
SHEETS: dict[str, int] = {
    "平成12年": 2000,
    "平成17年": 2005,
    "平成22年": 2010,
    "平成27年_原数値": 2015,
    "令和2年_原数値": 2020,
}
TOKYO, SPECIAL_WARDS = "13000", "13100"
WARD_CODES = [f"131{n:02d}" for n in range(1, 24)]
# Workbook layout (identical in the five sheets): rows 0–8 are the title,
# notes and the four header rows; data rows are
#   年次（西暦）, 年次（和暦）, 地域コード, 地域名, then 人口 総数×(総数,15歳未満,15～64歳,65歳以上),
#   男×(…4), 女×(…4), then 割合 columns, which are not kept.
FIRST_DATA_ROW = 9
POPULATION_COLUMNS = [
    "total", "total_0_14", "total_15_64", "total_65_plus",
    "male", "male_0_14", "male_15_64", "male_65_plus",
    "female", "female_0_14", "female_15_64", "female_65_plus",
]
CSV_COLUMNS = ["sheet", "year", "era", "code", "name", *POPULATION_COLUMNS]

# --- the 2025 確報 (PR 2's committed responses) ----------------------------------

POPULATION_TABLE, POPULATION_TAB, SEX_TOTAL = "0004065881", "2025_01", "0"
GROWTH_TABLE, BASE_2020_TAB, CHANGE_TAB = "0004065882", "2025_03", "2025_34"
CENSUS_OPEN_DATE = "2026-09-29"

REGION = "東京23区"
LICENCE = {
    "name": "e-Stat 利用規約（政府標準利用規約（第2.0版）準拠、CC BY 4.0 互換）",
    "url": "https://www.e-stat.go.jp/terms-of-use",
}
CREDIT = {
    "source": "出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）",
    "edited": "「国勢調査 時系列データ」「令和7年国勢調査 人口等基本集計」（総務省統計局）を加工して作成",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _year_of(label: object) -> int:
    """'2000年' -> 2000."""
    text = str(label).strip()
    if not text.endswith("年") or not text[:-1].isdigit():
        raise ValueError(f"not a census-year label: {label!r}")
    return int(text[:-1])


# --- extract -----------------------------------------------------------------


def extract(raw: Path = DOWNLOADS / RAW_FILE, out_dir: Path = TREND_FIXTURES, today: date | None = None) -> None:
    import openpyxl  # etl/requirements.txt; not a backend dependency

    workbook = openpyxl.load_workbook(raw, read_only=True, data_only=True)
    wanted = {TOKYO, SPECIAL_WARDS, *WARD_CODES}
    records: list[dict] = []
    notes: dict[str, list[str]] = {}
    for sheet, year in SHEETS.items():
        rows = list(workbook[sheet].iter_rows(values_only=True))
        title = str(rows[1][0])
        if "第６表" not in title or "東京都" not in title:
            raise ValueError(f"{sheet}: unexpected title {title!r}")
        notes[sheet] = [str(r[0]) for r in rows[2:FIRST_DATA_ROW] if r[0] and str(r[0]).startswith(("1)", "2)", "3)"))]
        found = 0
        for row in rows[FIRST_DATA_ROW:]:
            code = str(row[2]).strip() if row[2] is not None else ""
            if code not in wanted:
                continue
            if _year_of(row[0]) != year:
                raise ValueError(f"{sheet}: row for {code} says {row[0]!r}, expected {year}")
            values = [int(v) for v in row[4 : 4 + len(POPULATION_COLUMNS)]]
            record = dict(zip(POPULATION_COLUMNS, values))
            if record["male"] + record["female"] != record["total"]:
                raise ValueError(f"{sheet} {code}: 男 + 女 != 総数 ({record})")
            records.append({"sheet": sheet, "year": year, "era": str(row[1]), "code": code, "name": str(row[3]), **record})
            found += 1
        if found != len(wanted):
            raise ValueError(f"{sheet}: found {found} of {len(wanted)} rows")

    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / EXCERPT).open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)
    meta = {
        "stat_infid": STAT_INF_ID,
        "title": TITLE,
        "listing_url": LISTING_URL,
        "url": RAW_URL,
        "file": RAW_FILE,
        "bytes": raw.stat().st_size,
        "sha256": sha256(raw),
        "open_date": OPEN_DATE,
        "fetched": (today or date.today()).isoformat(),
        "sheets": {sheet: {"year": year, "notes": notes[sheet]} for sheet, year in SHEETS.items()},
        "rows_kept": f"地域コード {TOKYO} 東京都, {SPECIAL_WARDS} 特別区部, {WARD_CODES[0]}–{WARD_CODES[-1]} of every sheet; the 人口 columns, not the 割合 columns",
    }
    (out_dir / META).write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {out_dir / EXCERPT} ({len(records)} rows) and {out_dir / META}")


# --- build -------------------------------------------------------------------


def _estat_values(path: Path, stats_data_id: str) -> list[dict]:
    body = json.loads(path.read_text(encoding="utf-8"))
    data = body["GET_STATS_DATA"]["STATISTICAL_DATA"]
    if data["TABLE_INF"]["@id"] != stats_data_id:
        raise ValueError(f"{path.name}: table {data['TABLE_INF']['@id']}, expected {stats_data_id}")
    values = data["DATA_INF"]["VALUE"]
    return values if isinstance(values, list) else [values]


def _estat_names(path: Path) -> dict[str, str]:
    body = json.loads(path.read_text(encoding="utf-8"))
    for obj in body["GET_STATS_DATA"]["STATISTICAL_DATA"]["CLASS_INF"]["CLASS_OBJ"]:
        if obj["@id"] == "area":
            return {c["@code"]: c["@name"] for c in obj["CLASS"]}
    raise ValueError(f"{path.name}: no area classification")


def _timeseries(excerpt: Path) -> dict[int, dict]:
    """year -> {"era", "special_wards_total", "wards": {code: (name, total)}}."""
    rows = list(csv.DictReader(excerpt.read_text(encoding="utf-8").splitlines()))
    years: dict[int, dict] = {}
    for row in rows:
        year = int(row["year"])
        entry = years.setdefault(year, {"era": row["era"], "wards": {}})
        if row["code"] == SPECIAL_WARDS:
            entry["special_wards_total"] = int(row["total"])
        elif row["code"] in WARD_CODES:
            entry["wards"][row["code"]] = (row["name"], int(row["total"]))
    for year, entry in years.items():
        if sorted(entry["wards"]) != WARD_CODES:
            raise ValueError(f"{year}: wards {sorted(entry['wards'])}")
        total = sum(t for _n, t in entry["wards"].values())
        if total != entry["special_wards_total"]:
            raise ValueError(f"{year}: 特別区部 {entry['special_wards_total']} != sum of wards {total}")
    if sorted(years) != sorted(SHEETS.values()):
        raise ValueError(f"years in excerpt: {sorted(years)}")
    return years


def build(fixtures: Path = FIXTURES) -> dict:
    trend_dir, census_dir = fixtures / "population_trends", fixtures / "census_2025"
    excerpt, meta_path = trend_dir / EXCERPT, trend_dir / META
    population_path = census_dir / f"estat_{POPULATION_TABLE}_wards.json"
    growth_path = census_dir / f"estat_{GROWTH_TABLE}_wards.json"

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    series = _timeseries(excerpt)
    names = _estat_names(population_path)

    population_2025 = {
        v["@area"]: int(v["$"])
        for v in _estat_values(population_path, POPULATION_TABLE)
        if v["@tab"] == POPULATION_TAB and v["@cat01"] == SEX_TOTAL
    }
    growth_rows = _estat_values(growth_path, GROWTH_TABLE)
    base_2020 = {v["@area"]: int(v["$"]) for v in growth_rows if v["@tab"] == BASE_2020_TAB}
    change = {v["@area"]: int(v["$"]) for v in growth_rows if v["@tab"] == CHANGE_TAB}
    for code in WARD_CODES:
        # The 時系列 2020 sheet and the 確報's 2020年（組替） are the same basis for the 23 wards.
        if series[2020]["wards"][code][1] != base_2020[code]:
            raise ValueError(f"{code}: 時系列 2020 {series[2020]['wards'][code][1]} != 組替 {base_2020[code]}")
        if base_2020[code] + change[code] != population_2025[code]:
            raise ValueError(f"{code}: 2020 + 増減数 != 2025")
        for year, entry in series.items():
            if entry["wards"][code][0] != names[code]:
                raise ValueError(f"{code}: {year} name {entry['wards'][code][0]!r} != e-Stat {names[code]!r}")

    def point(year: int, table: str, wards: dict[str, int]) -> dict:
        return {
            "year": year,
            "table": table,
            "population": sum(wards.values()),
            "wards": [{"code": code, "name": names[code], "population": wards[code]} for code in WARD_CODES],
        }

    points = [
        point(year, STAT_INF_ID, {code: t for code, (_n, t) in entry["wards"].items()})
        for year, entry in sorted(series.items())
    ]
    points.append(point(2025, POPULATION_TABLE, population_2025))

    sources = {
        str(year): {
            "year": year,
            "table": STAT_INF_ID,
            "label": f"国勢調査 時系列データ 第6表 年齢（3区分），男女別人口及び年齢別割合－都道府県，市区町村（{entry['era']}）：東京都",
        }
        for year, entry in sorted(series.items())
    }
    sources["2025"] = {
        "year": 2025,
        "table": POPULATION_TABLE,
        "label": "令和7年国勢調査 人口等基本集計（確報）男女別人口",
    }

    return {
        "region": REGION,
        "reference": "各年10月1日現在（国勢調査）",
        "sources": sources,
        "inputs": {
            EXCERPT: {
                "path": f"backend/tests/fixtures/population_trends/{EXCERPT}",
                "sha256": sha256(excerpt),
                "cut_from": {k: meta[k] for k in ("stat_infid", "title", "listing_url", "url", "file", "bytes", "sha256", "open_date", "fetched")},
            },
            population_path.name: {
                "path": f"backend/tests/fixtures/census_2025/{population_path.name}",
                "sha256": sha256(population_path),
                "table": POPULATION_TABLE,
                "open_date": CENSUS_OPEN_DATE,
            },
            growth_path.name: {
                "path": f"backend/tests/fixtures/census_2025/{growth_path.name}",
                "sha256": sha256(growth_path),
                "table": GROWTH_TABLE,
                "open_date": CENSUS_OPEN_DATE,
                "role": "cross-check only: 2020年（組替） equals the 時系列 2020 sheet per ward; 2020 + 5年間の人口増減数 equals 2025",
            },
        },
        "licence": LICENCE,
        "credit": CREDIT,
        "points": points,
    }


def main(argv: list[str]) -> int:
    if argv[1:] == ["extract"]:
        extract()
    elif argv[1:] == ["build"]:
        snapshot = build()
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {SNAPSHOT} ({len(snapshot['points'])} points)")
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
