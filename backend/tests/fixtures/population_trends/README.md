# population_trends — source files for the 人口推移 guards (real-data plan PR 3)

Every figure the guards compare against is derived from the files in this
directory and in `../census_2025/`; nothing is typed by hand. The snapshot the
route serves, `backend/data/population_trends.json`, is built from the same
files by `etl/population_trends.py build`, and the test suite checks it against
a fresh build.

## 国勢調査 時系列データ 第6表 — 東京都 (総務省統計局, via e-Stat)

`estat_000001085987_tokyo23.csv` is cut from the official workbook by
`etl/population_trends.py extract`: for each of the five census-year sheets
used, the rows for 地域コード 13000 東京都, 13100 特別区部 and 13101–13123 (the 23
特別区), with the 人口 columns (総数・男・女 × 総数・15歳未満・15～64歳・65歳以上)
and without the 割合 columns. `estat_000001085987.meta.json` records the
workbook's URL, size, sha256, 公開日, fetch date and each sheet's notes.

| item | value |
|---|---|
| listing | https://www.e-stat.go.jp/stat-search/files?tclass=000001007702&cycle=0&layout=datalist (国勢調査 › 時系列データ › 男女，年齢，配偶関係) |
| table | 第6表 年齢（3区分），男女別人口及び年齢別割合 － 都道府県，市区町村（昭和55年～令和2年）, one file per prefecture; 東京都 = statInfId 000001085987 (EXCEL) |
| download | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000001085987&fileKind=0 → `da0613.xlsx`, 342,082 bytes, sha256 `7f86215c518a125e5e1bc22f19338b6bff9c0bc7524f9cb1772d0786cb7fcea3`, fetched 2026-11-01 |
| 公開（更新）日 | 2022-03-31 (調査年月 2020年) |
| sheets used | 平成12年 (2000), 平成17年 (2005), 平成22年 (2010), 平成27年_原数値 (2015), 令和2年_原数値 (2020). The two 不詳補完値 sheets carry the same 総数 and are not read. |

Basis (MEASURED from the workbook): each sheet is that census year as
enumerated (its title is 「…（平成12年）：東京都」 and so on; the only notes are
about 年齢「不詳」, none about 組替). For the 23 wards the 13100 特別区部 row
equals the sum of the 23 ward rows in every sheet used, and the 令和2年 sheet
equals, ward by ward, the 2020年（令和2年）の人口（組替） column of the 2025 確報
table 0004065882 (`../census_2025/estat_0004065882_wards.json`, tab 2025_03):
9,733,276 for the 23 wards on both sides. The builder asserts both.

Licence: e-Stat 利用規約 (https://www.e-stat.go.jp/terms-of-use), 政府標準利用規約
（第2.0版）準拠, stated compatible with CC BY 4.0; credit per 1)ア 「出典：政府統計の
総合窓口(e-Stat)（https://www.e-stat.go.jp/）」 and, for edited figures, 1)イ
「「○○調査結果」（A省）を加工して作成」.

## 2025 — 令和7年国勢調査 人口等基本集計（確報）

The 2025 point is the sum over the 23 wards of table 0004065881 (男女別人口, tab
2025_01, cat01 0 総数), read from `../census_2025/estat_0004065881_wards.json`
exactly as PR 2 committed it (公表 2026-09-29; provenance in that directory's
README). Architect decision 2026-11-01: the 確報, not the 速報 named in RECON §9
row 3, so the whole 人口 tab stays one vintage; no new e-Stat fetch.
