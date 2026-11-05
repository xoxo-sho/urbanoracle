# disaster — source files for the 災害 guards (real-data plan PR 7)

Every figure the guards compare against is derived from the files in this
directory; nothing is typed by hand except the Architect's cross-check figures
(2026-11-05). The snapshot the route serves, `backend/data/disaster_risks.json`,
is built from them by `etl/disaster.py build` (standard library only), and the
test suite checks it against a fresh build; so is the LP hero's
`src/data/hero-spread.json` (`etl/disaster.py hero`, from that snapshot and
`backend/data/land_prices.json`). The excerpts are cut from the official files
by `etl/disaster.py extract` (shapely); `ksj.meta.json` records every raw
file's URL, size, sha256 and edition. The committed files total 1,401,490
bytes. Raw downloads stay git-ignored under
`etl/_downloads/`.

## 地震 — 東京都「地震に関する地域危険度測定調査（第9回）」（令和4年9月公表）

| item | value |
|---|---|
| file | `tokyo_kikendo9_all2.csv` — committed whole, byte for byte (cp932, 5,192 町丁目 + header) |
| download | https://www.toshiseibi.metro.tokyo.lg.jp/bosai/chousa_6/download/all2.csv → 301 → https://www.toshiseibi.metro.tokyo.lg.jp/documents/d/toshiseibi/csv_bosai_chousa_6_download_all2; 355,915 bytes, sha256 `62ad9f4479f43ea254ed89bdfbc289ee9ccf7f18546a3713c29e6d63bbabbfb9`, Last-Modified 2024-10-01 |
| columns | 区市町名, 町丁目名, 地盤分類, 建物倒壊危険度 危険量（棟/ha）・順位・ランク, 火災危険度 危険量・順位・ランク, 災害時活動困難度困難係数, 総合危険度 危険量・順位・ランク. Three ranked measures; 災害時活動困難度 has a 困難係数 and no rank |
| ranks | 1–5, a relative evaluation among the 都's 5,192 町丁目 (市街化区域); 23区 = 3,138 町丁目, 85 at 総合危険度 rank 5 |
| licence | CC BY — read directly on the 東京都オープンデータAPIカタログ page of dataset t000008d0000000012 (https://spec.api.metro.tokyo.lg.jp/spec/t000008d0000000012-5611a503ba1c2785d49d69234d168148-0?lang=ja: 「ライセンス クリエイティブ・コモンズ 表示（CC BY）」, 「実データはこちら …/all2.csv」) and 東京都オープンデータ利用規約 (https://portal.data.metro.tokyo.lg.jp/terms/: CC BY 4.0 国際; §3 「…他のサイトの利用規約…と本利用規約が異なるときは、本利用規約が優先するものとします。」). The 都市整備局 site policy (https://www.toshiseibi.metro.tokyo.lg.jp/policy) says 「無断で複製・転用することはできません」 for the bureau's site in general; for this file, published as open data, §3 makes the open-data terms govern. The catalog page itself answers HTTP 403 from here (geo-blocked). |
| credit | 2(1)ア 「地震に関する地域危険度測定調査（第9回）地域危険度一覧（令和4年9月公表）、東京都、クリエイティブ・コモンズ・ライセンス 表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）」 and 2(1)イ 「このサービスは、以下の著作物を改変して利用しています。…」 |

## 洪水 — 国土数値情報 洪水浸水想定区域データ（河川単位）A31a-25, 2025年度（令和7年度）版, 想定最大規模

| item | value |
|---|---|
| page | https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A31a-2025.html (更新履歴 2026年10月) |
| downloads | `A31a-25_13_10_GEOJSON.zip` (東京都 洪水予報河川・水位周知河川) 12,009,145 B `ecef23e9…f93`; `A31a-25_13_20_GEOJSON.zip` (東京都 その他の河川) 20,496,987 B `3101bac4…0b4`; `A31a-25_83_10_GEOJSON.zip` (関東地方整備局 = 国管理河川: 荒川・江戸川・中川・綾瀬川・多摩川・利根川 …) 532,040,825 B `e66542ce…a35` — full hashes in `ksj.meta.json` |
| member | `20_想定最大規模/*.geojson`, rank `A31a_205` (浸水深ランク 1 0.5m未満 … 6 20.0m以上, `water_depth_code.xlsx`) |
| licence | 「■2025年度、2024年度、2023年度、2022年度、2021年度 … オープンデータ（CC_BY_4.0）」 |
| `ksj_A31a-25_L2_tokyo23.csv` | one row per (ward, rank): the area of the N03 ward polygon inside that rank and no deeper one — overlapping rivers resolved by the deepest rank (union per rank, difference with the deeper union, clipped to the ward; shapely on JGD2011 lon/lat, grid 1e-9°); area on 第IX系 by `etl/zoning.py` (standard library) on the geometry rounded to 9 decimals |
| `ksj_A31a-25_L2_guard.geojson` | that resolved geometry for one guard ward — 荒川区, the ward whose file is smallest while covering ≥ 2 ranks (880,668 B; every ward's size is in `ksj.meta.json` `A31a.guard_sizes`); `etl/disaster.py verify` and the guards re-derive its rows from it with the standard library |

## 土砂 — 国土数値情報 土砂災害警戒区域データ A33-25, 2025年度（令和7年度）版, 東京都

| item | value |
|---|---|
| download | https://nlftp.mlit.go.jp/ksj/gml/data/A33/A33-25/A33-25_13_GEOJSON.zip — 7,011,838 B, sha256 `4107d815b48fd3a4e9d5394ff4c8504f9f54924293bb021c5f51b6ea3f2ee847` (DisasterShield's pin, disastershield@57055df `backend/app/scripts/load_ksj_hazard.py:120-128`) |
| 時点 | 東京都 「本データは2025年7月30日時点の整備です。」 (the zip's 注意事項 file; `A33_permision_R7.xlsx` 東京都 row = 2025-07-30) |
| licence | 「オープンデータ（CC_BY_4.0（一部制限））」; 東京都 in 「オープンデータとしての利用可（商用利用可・再配信可）」 |
| `ksj_A33-25_tokyo23.csv` | one row per (zone polygon, ward) it reaches with positive area: 区域番号 `A33_004`, 現象 `A33_001` (1 急傾斜地の崩壊 / 2 土石流 / 3 地滑り), 区分 `A33_002` (1 警戒区域 / 2 特別警戒区域), 公示日, 特別警戒未指定フラグ and the area inside the ward. Every zone in the 23 wards is 急傾斜地の崩壊 |

## 津波 — 国土数値情報 津波浸水想定データ A40-23, 東京都

| item | value |
|---|---|
| download | https://nlftp.mlit.go.jp/ksj/gml/data/A40/A40-23/A40-23_13_GML.zip — 8,710,803 B, sha256 `b8e24973e5f9b885d481c28211f107587d14597cb3d9674d26c1aa591dacdc5c` |
| licence | 「オープンデータ（CC_BY_4.0（一部制限））」; 東京都 「商用利用可・再配信可」 (KsjTmplt-A40-2024.html, read 2026-11-04) |
| `ksj_A40-23_tokyo23_coverage.json` | the file's 33,124 polygons lie between 26.60°N and 34.80°N (伊豆・小笠原諸島); 0 intersect the 23区 bbox or any ward polygon. Basis that the 区部 has no 津波浸水想定: 国土交通省 令和5年7月28日 資料7-1 p.4 「津波浸水想定は、東京都の区部を除いて設定済み。」 and 東京都「東京都の津波浸水想定について（解説）」 p.1 「…第 8 条第１項に基づいて、東京都の島しょ部を対象として実施しました。」 (URLs and sha256 in the file). The screen says 「対象外：…（国土数値情報 A40 に23区の区域なし）」 |

## 高潮 — 国土数値情報 高潮浸水想定区域データ A49-20, 2020年度（令和2年度）版, 東京都

| item | value |
|---|---|
| download | https://nlftp.mlit.go.jp/ksj/gml/data/A49/A49-20/A49-20_13_GML.zip — 31,712,745 B, sha256 `cec46df37c0d8cabc660fc85f8ec6f0cac78b6754a5387f7be21b7a599810390` (the 東京都 file the A49-2024 page lists) |
| licence | 「オープンデータ（CC_BY_4.0（一部制限））」; 東京都 「商用利用可・再配信可」 |
| classes | `A49_003` as the file labels them: 0.3m未満 … 10m以上20m未満 |
| `ksj_A49-20_tokyo23.csv` / `ksj_A49-20_guard.geojson` | as for 洪水; the guard ward is 目黒区 (25,895 B) |

## 行政区域 N03 — 2026年（令和8年）1月1日時点 東京都

PR 4's committed excerpt `backend/tests/fixtures/stations/ksj_N03-20260101_tokyo23.geojson`
(sha256 recorded in `ksj.meta.json` with the 23 ward areas on 第IX系, which
`build` recomputes). Every share's denominator is the N03 ward polygon, which
includes rivers, sea and landfill.
