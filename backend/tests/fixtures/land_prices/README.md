# land_prices — source file for the 地価 guards (real-data plan PR 5)

Every figure the guards compare against is derived from the one file in this
directory; nothing is typed by hand. The snapshot the route serves,
`backend/data/land_prices.json`, is built from the same file by
`etl/land_prices.py build`, and the test suite checks it against a fresh
build. The excerpt is cut from the official zip by `etl/land_prices.py
extract`; `ksj.meta.json` records the zip's URL, size, sha256, edition and
licence line.

## 国土数値情報 地価公示データ L01 — 2026年（令和8年）版, 東京都 (国土交通省)

`ksj_L01-26_tokyo23.csv`: the 1,567 rows of `L01-26_13.geojson` whose
L01_001 (行政区域コード) is 13101–13123, with the attributes the builder reads:

| column | attribute | meaning |
|---|---|---|
| code | L01_001 | 行政区域コード (全国地方公共団体コード) |
| ward | — | the ward's name for that code (総務省 list, as src/lib/wards.ts) |
| use | L01_002 | 用途区分: 000 住宅地, 003 宅地見込地, 005 商業地, 009 工業地, 013 林地 (codelist L01_v4_0_IndexNumberCodeType) |
| seq | L01_003 | 連番 (市区町村・用途区分単位); code-use-seq is the 標準地番号 |
| year | L01_007 | 年度 (2026) |
| price | L01_008 | 地価公示価格 当年 (円/m²); equals L01_105 令和8年公示価格 on every row |
| change | L01_009 | 対前年変動率 (%): 「継続する標準地について前年の地価公示価格との対比から算出 …小数点以下第2位を四捨五入」; 0 on a point without a previous year |
| status | L01_010 | 選定状況: 1 継続, 2 基準地番号変更, 4 新設・選定替えで当該年追加, 5 隔年調査（休止）地点 (codelist L01_v4_0_SelectLandStatusCodeType) |
| previous_price | L01_104 | 令和7年公示価格 (円/m²; 0 when not surveyed that year) |
| common | L01_060 | 共通地点 (都道府県地価調査との共通地点か) |
| lon, lat | geometry | the 標準地's point |

In the 23 wards: 1,567 points = 1,530 継続 + 10 新設 + 27 隔年調査; 住宅地 871,
商業地 674, 工業地 22; no 宅地見込地 or 林地. On every 継続 row `change` equals
the half-up rounding of (price − previous_price) × 100 ÷ previous_price to one
decimal.

| item | value |
|---|---|
| page | https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L01-2026.html |
| download | https://nlftp.mlit.go.jp/ksj/gml/data/L01/L01-26/L01-26_13_GML.zip → 2,241,471 bytes, sha256 `4f3e251683a6affe7181236b60fda2a7eee1d5e83daffc9db82435a1542a7795` |
| edition | 2026年（令和8年）版, 2026年1月1日時点; 更新履歴「2026年3月：2026年（令和8年）版に更新しました。」 |
| licence | 「2019年（平成31年）以降：オープンデータ（CC_BY_4.0）」 |

## How the builder reads it (Architect decision 4, 2026-11-02)

Per ward and per use — 住宅地 (000) and 商業地 (005):

* **price** = the simple mean of `price` over every point of that use
  (継続, 新設 and 隔年調査 alike), rounded to the yen;
* **change** = the simple mean of `change` over the 継続 points (`status` = 1)
  of that use; `nContinuing` says how many;
* **n** = the point count, carried with every figure.

工業地 (009) gets its point count only; it has points in six wards. These are
the definitions behind the 区市町村別用途別平均価格表 and the 区市町村別用途別
対前年変動率 the 東京都財務局 publishes for the same edition; the agreement was
checked outside the repo and nothing from those PDFs is committed here.

Licence: 国土数値情報 利用規約 (https://nlftp.mlit.go.jp/ksj/other/agreement.html),
credit per Architect decision 12 in the 加工 form with no editor name:
「「国土数値情報（地価公示データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成」.
