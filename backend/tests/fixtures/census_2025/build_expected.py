"""Build expected.json for the 23 特別区 from the committed source files.

No network, no hand-typed figures: every number below is read from the raw
e-Stat API responses in this directory and from the 国土地理院 面積調 CSV
excerpt, and the three cross-checks the official tables allow are asserted
while building (real-data plan PR 2, RECON 2026-10-uo-real-data §9 row 2).

Sources (all fetched 2026-10-30; README.md records URLs, dates and digests):

  estat_0004065881_wards.json  令和7年国勢調査 人口等基本集計（確報・原数値）
                               男女別人口－全国、都道府県、市区町村
                               tab 2025_01 人口, cat01 0 総数
  estat_0004065882_wards.json  same tabulation, 2020年（組替）、5年間の人口増減率、
                               面積（参考）及び人口密度－全国、都道府県、市区町村
                               tab 2025_03 / 2025_34 / 2025_35 / 2025_47 / 2025_48
  estat_0004066221_wards.json  令和7年国勢調査 人口等基本集計 不詳補完値
                               男女、年齢（3区分）…人口構成比［年齢別］－全国、都道府県、市区町村
                               tab 2025_42, cat01 0 国籍総数, cat02 0 総数, cat03 1/2/3
  mencho_r8_07_tokyo23.csv     国土地理院 全国都道府県市区町村別面積調, the 23-ward rows of
                               the official CSV (R8_07_mencho.csv), column 令和7年10月1日(k㎡)

Run:  python backend/tests/fixtures/census_2025/build_expected.py
"""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

POPULATION_TABLE = "0004065881"
GROWTH_TABLE = "0004065882"
AGE_TABLE = "0004066221"
AREA_CSV = "mencho_r8_07_tokyo23.csv"
AREA_COLUMN = "令和7年10月1日(k㎡)"
AREA_REMARK_COLUMN = "令和7年10月1日備考"

POPULATION_TAB, SEX_TOTAL = "2025_01", "0"
BASE_2020_TAB, CHANGE_TAB, GROWTH_TAB, AREA_TAB, DENSITY_TAB = (
    "2025_03", "2025_34", "2025_35", "2025_47", "2025_48",
)
SHARE_TAB, NATIONALITY_TOTAL, AGE_CODES = "2025_42", "0", {"young": "1", "working": "2", "elderly": "3"}

WARD_CODES = [f"131{n:02d}" for n in range(1, 24)]


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _values(stats_data_id: str) -> list[dict]:
    body = json.loads((HERE / f"estat_{stats_data_id}_wards.json").read_text(encoding="utf-8"))
    data = body["GET_STATS_DATA"]["STATISTICAL_DATA"]
    assert data["TABLE_INF"]["@id"] == stats_data_id, data["TABLE_INF"]["@id"]
    values = data["DATA_INF"]["VALUE"]
    return values if isinstance(values, list) else [values]


def _grid(rows: list[dict], *keys: str) -> dict[str, dict[tuple, str]]:
    out: dict[str, dict[tuple, str]] = {}
    for row in rows:
        out.setdefault(row["@area"], {})[tuple(row.get(k) for k in keys)] = row["$"]
    return out


def _areas() -> dict[str, tuple[str, float, str]]:
    rows = list(csv.reader((HERE / AREA_CSV).read_text(encoding="utf-8").splitlines()))
    header = rows[0]
    code_i, name_i = header.index("標準地域コード"), header.index("市区町村")
    area_i, remark_i = header.index(AREA_COLUMN), header.index(AREA_REMARK_COLUMN)
    return {r[code_i]: (r[name_i], float(r[area_i]), r[remark_i]) for r in rows[1:] if r[code_i]}


def build() -> dict:
    population = _grid(_values(POPULATION_TABLE), "@tab", "@cat01")
    growth = _grid(_values(GROWTH_TABLE), "@tab")
    shares = _grid(_values(AGE_TABLE), "@tab", "@cat01", "@cat02", "@cat03")
    areas = _areas()

    wards: dict[str, dict] = {}
    for code in WARD_CODES:
        name, area_km2, remark = areas[code]
        total = int(population[code][(POPULATION_TAB, SEX_TOTAL)])
        base_2020 = int(growth[code][(BASE_2020_TAB,)])
        change = int(growth[code][(CHANGE_TAB,)])
        growth_rate = float(growth[code][(GROWTH_TAB,)])
        estat_area = float(growth[code][(AREA_TAB,)])
        estat_density = float(growth[code][(DENSITY_TAB,)])
        age = {
            k: float(shares[code][(SHARE_TAB, NATIONALITY_TOTAL, "0", c)]) for k, c in AGE_CODES.items()
        }

        # Cross-checks the two 確報 tables and the 面積調 allow.
        assert base_2020 + change == total, (code, base_2020, change, total)
        assert estat_area == area_km2, (code, estat_area, area_km2)
        assert round(total / area_km2, 1) == estat_density, (code, total / area_km2, estat_density)
        assert abs(sum(age.values()) - 100) < 0.01, (code, age)

        wards[code] = {
            "name": name,
            "population": total,
            "population_2020": base_2020,
            "area_km2": area_km2,
            "area_remark": remark,
            "density_estat": estat_density,
            "growth_rate": growth_rate,
            "age_share": age,
        }

    return {
        "meta": {
            "census": "令和7年国勢調査 人口等基本集計（確報）",
            "reference_date": "2025-10-01",
            "tables": {
                "population": POPULATION_TABLE,
                "growthRate": GROWTH_TABLE,
                "ageGroups": AGE_TABLE,
            },
            "area": {
                "publisher": "国土地理院",
                "edition": "令和7年全国都道府県市区町村別面積調（10月1日時点）",
                "csv_column": AREA_COLUMN,
            },
            "inputs": {
                p.name: _sha256(p)
                for p in sorted(HERE.iterdir())
                if p.suffix in {".json", ".csv"} and p.name != "expected.json"
            },
        },
        "wards": wards,
    }


if __name__ == "__main__":
    out = HERE / "expected.json"
    out.write_text(json.dumps(build(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(WARD_CODES)} wards)")
