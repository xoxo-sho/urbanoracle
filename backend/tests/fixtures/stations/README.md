# stations — source files for the 駅別乗降客数 guards (real-data plan PR 4)

Every figure the guards compare against is derived from the two files in this
directory; nothing is typed by hand. The snapshot the route serves,
`backend/data/stations.json`, is built from the same files by
`etl/stations.py build`, and the test suite checks it against a fresh build.
Both excerpts are cut from the official zips by `etl/stations.py extract`;
`ksj.meta.json` records each zip's URL, size, sha256, edition and licence line.

## 国土数値情報 駅別乗降客数データ S12 — 2024年度（令和6年度）版 (国土交通省)

`ksj_S12-25_tokyo23.geojson`: the rows of `S12-25_NumberOfPassengers.geojson`
whose line midpoint lies inside one of the 23 ward polygons below — every
attribute and the geometry verbatim. One row per 運営会社 × 路線 × 駅; the
attributes are the datalist page's: S12_001 駅名, S12_001c 駅コード, S12_001g
グループコード (same-name stations within 300 m), S12_002 運営会社, S12_003 路線名,
S12_004 鉄道区分, S12_005 事業者種別, then per year 2011–2024 four columns —
重複コード (1 当該路線駅に記載 / 2 他路線駅に記載 / 3 駅なし), データ有無コード
(1 データ有 / 2 データなし / 3 非公開 / 4 駅なし), 備考, 乗降客数 (人/日). The
2024 columns are S12_058–S12_061.

| item | value |
|---|---|
| page | https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-S12-2024.html |
| download | https://nlftp.mlit.go.jp/ksj/gml/data/S12/S12-25/S12-25_GML.zip → 6,913,743 bytes, sha256 `0785e932a32b3ec15e1a1345537ae145eafe1c07bf38d5c16c11ee2b391e7a28` |
| edition | 2024年度（令和6年度）版, 更新履歴「2026年4月：2024年度（令和6年度）版に更新しました。」 |
| licence | 「このデータの使用許諾条件 オープンデータ（CC_BY_4.0）」; 「ただし、一部非公開の駅があります。」 |
| what 乗降客数2024 is | 2024年度 (FY2024), 1日平均. For 新宿, 東京, 池袋, 渋谷 and 小岩 the 東日本旅客鉄道 rows equal exactly 2 × the 1日平均乗車人員 on JR East's own 各駅の乗車人員 2024年度 page (https://www.jreast.co.jp/company/data/passenger/: 新宿 666,809; 池袋 499,128; 東京 434,564; 渋谷 324,414; 小岩 60,083) and likewise for 2023年度 (…/passenger/2023.html: 650,602; 489,933; 403,831; 314,059; 58,306), read 2026-11-02. So the JR figures are 乗車人員 doubled; S12's 備考 does not say so (it only lists the lines a figure includes). |

## 国土数値情報 行政区域データ N03 — 2026年（令和8年）1月1日時点 東京都 (国土交通省)

`ksj_N03-20260101_tokyo23.geojson`: the features of `N03-20260101_13.geojson`
whose N03_007 (全国地方公共団体コード) is 13101–13123 — 118 MultiPolygon features
for the 23 特別区, geometry verbatim (江東区 alone is 75 polygons).

| item | value |
|---|---|
| page | https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html |
| download | https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2026/N03-20260101_13_GML.zip → 13,153,227 bytes, sha256 `94f10b26256566db970dd74b09d614f059c1e8a432f9244ac9c4add76c32ff16` |
| edition | 2026年（令和8年）1月1日時点, 更新履歴「2026年4月：2026年（令和8年）版に更新しました。」 |
| licence | 「このデータの使用許諾条件 オープンデータ（CC_BY_4.0）」 |

## `ridership_panel.json` — the panel 乗降客数推移 sums (real-data plan PR 4b)

S12's fourteen 乗降客数 columns are not one time series: checked row by row
against the operators' own published figures (2026-11-09), some years repeat
or lag another, what a row contains changes at interchange stations while its
備考 does not, and a few values are entry errors. The Architect's decision
(2026-11-09): 乗降客数推移 sums a **fixed panel** of units over 2018 and
2020–2024 and leaves 2019 a gap; values are S12's as published — nothing is
adjusted or re-dated.

The file lists every unit that has a 2024 figure (583; a unit is one S12 row,
or the rows of one station whose figures S12 moves between each other inside
one ward), says `in` true or false (458 in), and for every excluded unit the
reason **class** and the panel years it concerns — `repeat_or_lag`,
`definition_change`, `opened_or_closed`, `entry_error`, `unexplained`. Rows
are named by their position in `ksj_S12-25_tokyo23.geojson` (whose sha256 the
file records) together with 駅コード, 運営会社, 路線名 and 駅名, and the builder
refuses a panel whose rows no longer match the excerpt, that leaves a 2024
figure row out, or that admits a unit lacking a figure in a panel year.

This file is a decision record, not something the builder can re-derive: the
checks behind each class compare S12 with the operators' own pages, and those
figures are not open data. They stay outside the repository, in the real-data
plan's evidence folder (`ridership-trend/`: the report, the per-row table of
flagged cases, the scripts and the pages as read). No operator figure is
committed here. The 2019 gap needs none of them: on every 東日本旅客鉄道 row of
the panel, S12's 乗降客数2019 equals its 乗降客数2018 — the builder checks it
and writes the count into the snapshot.

## S12's own notice

The dataset page (`KsjTmplt-S12-2024.html`, 「その他の情報」, second bullet,
read 2026-11-09) says: 「各事業者から提供された駅別乗降客数は、各社で独自に算出した
ものであり、統一的な基準に基づいたものではありませんので、その旨を認識した上でご利用
ください。」 The builder carries the sentence, as one line, in the snapshot's
`notes.source_notice`, and every transport surface shows it.

## How the builder reads them

A row's ward is the polygon containing the midpoint of its line (even-odd
point-in-polygon over every polygon and hole; identical to shapely's
`contains` on all 10,534 rows of the national file when this was written).
26 rows have their two endpoints in different wards; the midpoint decides and
the snapshot lists them (`straddlingRows`). Rows whose 重複コード2024 is 3 駅なし
are not stations of 2024 (the two 上野懸垂線 stops, closed 2023-12-31). A
station is one S12 グループコード inside one ward; a group whose rows all say
他路線駅に記載 is folded into the same-name group of the same ward when exactly
one such group carries figures (the 京葉線 platform of 東京, the 有楽町線 platform
of 池袋), else it stays with no figure. Per operator, the figure is the sum of
乗降客数2024 over the rows with 重複コード 1 and データ有無コード 1; the station's
figure is the sum over operators; a ward's 日間乗降客 (K3) is the sum over its
rows — 乗換客 are counted once per operator, as the source counts them.

Since PR 4b each figure row's 備考2024 goes to its station as S12 writes it
(`remarks`). No line a 備考 names carries a 2024 figure on its own row (98
named rows, all 重複コード 2 with value 0), so nothing enters a sum twice. A
station every row of which says 他路線駅に記載 gets `countedElsewhere`: the
figure row of the same group whose 備考 names the station's line — its ward,
station, operator and line, and the sentence the screen prints
(「乗降客数は千代田区の飯田橋駅（東京メトロ東西線）に含まれます」) — or, where no
備考 names it (とうきょうスカイツリー in 2024), an empty target list and no
sentence. 乗降客数推移 (`trend`) is the panel summed per ward and for the 23
wards with the same rule, year by year.

Licence for both: 国土数値情報 利用規約 (https://nlftp.mlit.go.jp/ksj/other/agreement.html),
credit per Architect decision 12 in the 加工 form with no editor name:
「「国土数値情報（駅別乗降客数データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成」
and the same for 行政区域データ.
