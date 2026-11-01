# census_2025 — source files for the 2025 census guards (real-data plan PR 2)

Every figure the guards compare against is derived by `build_expected.py` from
the files in this directory; nothing is typed by hand. `expected.json` is its
output and is itself checked against a fresh build in the test suite.

All files were fetched on 2026-10-30. The e-Stat responses are the raw bodies of
`GET https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData` for
`cdArea=13101,…,13123` (the 23 特別区); the API key is not part of a response.

## 令和7年国勢調査 人口等基本集計 (総務省統計局, via e-Stat)

公表 2026-09-29 (`OPEN_DATE` of every table below; 統計局
https://www.stat.go.jp/data/kokusei/2025/kekka.html lists 人口等基本集計 under
令和8年9月29日). The 人口速報集計 was published 2026-05-29 and is superseded here.

| file | statsDataId | tabulation (`STATISTICS_NAME_SPEC`) | table (`TITLE`) | cells used |
|---|---|---|---|---|
| `estat_0004065881_wards.json` | 0004065881 | 令和７年国勢調査 › 集計結果（原数値） › 人口等基本集計 | 男女別人口－全国、都道府県、市区町村（2000年（平成12年）市区町村含む） | tab `2025_01` 人口, cat01 `0` 総数 |
| `estat_0004065882_wards.json` | 0004065882 | same | 2020年（令和2年）の人口（組替）、…、5年間の人口増減率、…、面積（参考）及び人口密度－全国、都道府県、市区町村（2000年（平成12年）市区町村含む） | tab `2025_03` 2020年の人口（組替）, `2025_34` 5年間の人口増減数, `2025_35` 5年間の人口増減率 (％), `2025_47` 面積（参考） (km2), `2025_48` 人口密度 (1km2当たり) |
| `estat_0004066221_wards.json` | 0004066221 | 令和７年国勢調査 › 参考表：不詳補完値 ※原数値の不詳を補完した結果 › 令和７年国勢調査に関する不詳補完値 › 人口等基本集計 | 男女、年齢（3区分）、国籍総数か日本人別人口構成比［年齢別］－全国、都道府県、市区町村（2000年（平成12年）市区町村含む） | tab `2025_42` 人口構成比［年齢別］ (％), cat01 `0` 国籍総数, cat02 `0` 総数, cat03 `1` 15歳未満 / `2` 15～64歳 / `3` 65歳以上 |

Age shares come from the 不詳補完値 table because its three shares sum to 100
(the 原数値 shares leave 年齢「不詳」 in the denominator), which is what the
official 結果の概要 reports.

Licence: e-Stat 利用規約 (https://www.e-stat.go.jp/terms-of-use), 政府標準利用規約
（第2.0版）準拠, stated compatible with CC BY 4.0; credit per 1)ア
「出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）」 and, for
edited figures, 1)イ 「「○○調査結果」（A省）を加工して作成」. The API credit
sentence (https://www.e-stat.go.jp/api/api-info/credit) is shown on the app.

## 国土地理院 全国都道府県市区町村別面積調

`mencho_r8_07_tokyo23.csv`: the header row, the 23 特別区 rows and the
荒川河口部 row their remarks refer to, columns intact, cut from the official
CSV `https://www.gsi.go.jp/KOKUJYOHO/MENCHO/backnumber/R8_07_mencho.csv`
(令和6年4月以降, 348,857 bytes, sha256
`1e5cbbf1fc0fda22ffa3367180d5e57ae0ad43c0d80589a2621f7d119410ca19`, fetched
2026-10-30). The column used is `令和7年10月1日(k㎡)`: the edition
「令和7年全国都道府県市区町村別面積調（10月1日時点）」 (国土地理院技術資料
E2-No.90, published 2025-12-19, PDF
`https://www.gsi.go.jp/KOKUJYOHO/MENCHO/backnumber/GSI-menseki20251001.pdf`,
sha256 `6b0ddc4ee38ce02f66af99d4ad978e0cb49950729e40885c752f3c7113f15bbd`),
whose reference date is the census date 2025-10-01. The e-Stat 面積（参考）
column of table 0004065882 carries the same 23 values, which the builder asserts.

Remarks carried over from the CSV: 千代田区・中央区・港区・葛飾区・江戸川区 are
（参考値） (境界の一部が未定); 江東区・江戸川区 exclude the 荒川河口部 (1.12 km²),
which is counted in the 特別区部 total only.

Licence: 国土地理院コンテンツ利用規約 (令和7年11月20日改正,
https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html) applies
公共データ利用規約（第1.0版）(PDL1.0); credit per 1)ア 「出典：国土地理院ウェブサイト
（当該ページのURL）」, with a 加工 statement when edited. 面積調 is 国土地理院技術資料;
商用利用も可能 (https://www.gsi.go.jp/REPORT/TECHNICAL/technical.html).

## legacy/ — what main served before this PR (evidence, not a source)

| file | statsDataId | tabulation | why it is here |
|---|---|---|---|
| `legacy/estat_0003448299_wards.json` | 0003448299 | 令和2年国勢調査 (2020) | the census table main reads population, density and age from |
| `legacy/estat_0004050417_wards.json` | 0004050417 (tab `2025_35`) | 令和７年国勢調査 › 速報集計 › 人口速報集計, OPEN_DATE 2026-05-29 | the 速報 growth table main reads; the RED guards show its 江戸川区 value differs from the 確報 |
