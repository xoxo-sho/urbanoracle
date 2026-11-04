# zoning — source files for the 用途地域 guards (real-data plan PR 6)

Every figure the guards compare against is derived from the files in this
directory; nothing is typed by hand. The snapshot the route serves,
`backend/data/zoning.json`, is built from them by `etl/zoning.py build`
(standard library only), and the test suite checks it against a fresh build.
The excerpts are cut from the official files by `etl/zoning.py extract`
(pyshp, shapely, openpyxl; pyproj cross-checks the projection); `ksj.meta.json`
records every raw file's URL, size, sha256, edition and licence line.

## 国土数値情報 都市計画決定情報データ A55 — 2024年度（令和6年度）版, 東京都 (国土交通省)

| item | value |
|---|---|
| page | https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A55-2024.html |
| download | https://nlftp.mlit.go.jp/ksj/gml/data/A55/A55-24/A55-24_13000_SHP.zip → 51,363,053 bytes, sha256 `330895e56ab323cf4da8033de1f59b65400dde3feb149141b90eba5cfc090962` |
| edition | 2024年度（令和6年度）版; 更新履歴「2025年11月：2024年度（令和6年度）版に更新しました。」 |
| layer | `A55-24_13000_SHP/A55-24_131xx_SHP/131xx_youto.shp` (用途地域) of each of the 23 ward folders — JGD2011 geographic (`GCS_JGD_2011`), UTF-8; 7,285 polygons, none 廃止, none invalid |
| codes | `A55_R6_AttributeCodelist.pdf` p.1 — YoutoCode 1 第１種低層住居専用地域 … 7 準住居地域, **8 田園住居地域, 9 近隣商業地域, 10 商業地域, 11 準工業地域, 12 工業地域, 13 工業専用地域** (not A29's or the 東京都 GIS numbering); every feature's YoutoName equals the codelist name |
| licence | 「オープンデータ（CC_BY_4.0）」 under the 国土数値情報 利用規約 (https://nlftp.mlit.go.jp/ksj/other/agreement.html) |

The raw zip is git-ignored (`etl/_downloads/ksj_A55-24_13/`), as is the data
list below.

### `ksj_A55-24_youto_tokyo23.csv` — the builder's input

One row per 用途地域 polygon of the 23 ward layers:

| column | meaning |
|---|---|
| code, ward | Citycode (13101–13123) and the ward's name |
| idx | the feature's index in its ward's youto layer |
| youto_code, youto_name | YoutoCode and YoutoName (checked against the codelist) |
| far, bcr | FAR 容積率 and BCR 建蔽率 (%), as the layer records them |
| area_m2 | the polygon's area on 平面直角座標系第IX系 (EPSG:6677, JGD2011): every coordinate rounded to 9 decimals (≈ 0.1 mm), projected by `etl/zoning.py tm_project` (国土地理院's Gauss-Krüger series, standard library; max 3.2e-8 m from pyproj on 5,765 vertices) and measured by the shoelace formula |
| in_ward_m2 | area of polygon ∩ the ward's N03 polygon (shapely, same projection); equal to area_m2 when `inside` = 1 |
| inside | 1 when the N03 polygon covers the whole polygon |
| vertices | vertex count |

### `ksj_A55-24_youto_13101_13123.geojson` — geometry for the guards

The 千代田区 (94) and 江戸川区 (455) layers as GeoJSON with the same rounding
and attributes. `test_zoning.py` re-projects every feature with the builder's
own formula and matches its area to the CSV to the mm²; `etl/zoning.py
verify` does the same from the command line.

## 国土数値情報 行政区域データ N03 — 2026年（令和8年）1月1日時点 東京都

The ward polygons are PR 4's committed excerpt
`backend/tests/fixtures/stations/ksj_N03-20260101_tokyo23.geojson` (cut from
`N03-20260101_13_GML.zip`, sha256 `94f10b26…ff16`); `ksj.meta.json` records
its sha256 and the 23 ward areas on 第IX系, which `build` recomputes.

## `a55_datalist_asof_tokyo23.json` — the per-ward 時点 (Architect decision 2026-11-03, way 1)

Derived from the A55 page's 公表自治体及び掲載データ一覧
(https://nlftp.mlit.go.jp/ksj/gml/codelist/A55_R6_datalist.xlsx, 267,640
bytes, sha256 `e27222a72127a6e45b393d2ae1963d2827e8915276ec235013ad892cc337c21a`),
sheet 公表自治体及び掲載データ一覧, columns 団体コード / 用途地域 / データ作成年 /
データ時点年 / 留意事項. The page's 注意事項 bullet 4 says the 時点 is to be read
from this list. Rule: the ward's own row decides; a date cell is the date; a
cell that itemises by item number takes ③ (用途地域); 「都に準ずる」 takes the
東京都 row (130001, 2024-04-26); anything else is no date. Each entry quotes
the cells as they stand.

| ward | データ時点年 cell | 時点 |
|---|---|---|
| 千代田区 | 2024-03-26 | 2024-03-26 |
| 中央区 | 「①、②、③、⑤、⑥：R5.12.18 ④：R6.7.331」 | 2023-12-18 (③) |
| 港区 | 2021-07-01 | 2021-07-01 |
| 新宿区・文京区・台東区・杉並区・豊島区・北区・足立区 | 2023-04-28 | 2023-04-28 |
| 墨田区 | 2024-09-01 | 2024-09-01 |
| 江東区 | 「㉝道路2024年度、㊱公園2023年度」 | none |
| 品川区 | 2024-03-06 | 2024-03-06 |
| 目黒区 | 「－」 | none |
| 大田区 | 2024-10-01 | 2024-10-01 |
| 世田谷区 | 2024-08-31 | 2024-08-31 |
| 渋谷区 | 「－」 | none |
| 中野区 | 2023-12-01 | 2023-12-01 |
| 荒川区 | 2024-03-31 | 2024-03-31 |
| 板橋区 | 「－」 | none |
| 練馬区 | 2024-09-10 | 2024-09-10 |
| 葛飾区 | 2023-12-21 | 2023-12-21 |
| 江戸川区 | 「都に準ずる」 | 2024-04-26 (the 東京都 row) |

A ward without a date renders 「時点：国土数値情報の掲載データ一覧に記載なし」;
the 23区 view renders 「2021年7月1日〜2024年10月1日（4区は掲載データ一覧に記載なし）」.

## How the builder reads it (Architect decisions 2026-11-03)

Per ward:

* **designated** = Σ in_ward_m2 over the ward's polygons; **designated share
  of the ward** = designated ÷ the N03 ward polygon's area — never above 100
  by construction (江戸川区 83.75 %, 千代田区 99.32 %);
* **share** (Z1 and the 災害 tab's D2) = per type, its clipped area ÷
  designated; the shares sum to 100;
* **Z2** = per type present, the area-weighted mean 容積率 / 建蔽率 (weights:
  in_ward_m2) and the min–max of the polygon values;
* types keep A55's codes and names; only the types present are listed, in
  code order (田園住居地域 has no area in the 23 wards).

The 23区 composition is the same computation over every polygon (an
area-weighted sum over the wards).

Licence: 国土数値情報 利用規約 (https://nlftp.mlit.go.jp/ksj/other/agreement.html),
credit per Architect decision 12 in the 加工 form with no editor name:
「「国土数値情報（都市計画決定情報データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成」
and 「「国土数値情報（行政区域データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成」.
The A55 page's six 【重要：データ利用時の注意事項】 are carried verbatim in the
snapshot (`notices`) and shown with the figures.
