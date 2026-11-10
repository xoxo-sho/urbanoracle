# UrbanOracle データソース仕様書

## 1. データカテゴリ一覧

| カテゴリ | データ元 | 認証 | 形式 | 更新頻度 | 対応する型 |
|---------|---------|------|------|---------|-----------|
| 地価 | 国土数値情報 (MLIT) | 不要 | GeoJSON | 年1回（3月） | `LandPricePoint` |
| 人口統計 | e-Stat API | API キー（無料） | JSON | 年1回（国勢調査） | `DemographicsData` |
| 災害リスク | ハザードマップポータル | 不要 | タイル / GeoJSON | 不定期 | `DisasterRisk` |
| 交通 | 国土数値情報 S12・N03（委託スナップショット） | 不要 | GeoJSON → JSON | 年1回（S12 の年度版） | `TransportStation` |
| 用途地域 | 国土数値情報 A55・N03（委託スナップショット） | 不要 | Shapefile → JSON | A55 の年度版（2024年度版は 2025年11月公開） | `ZoningComposition` |

---

## 2. 地価データ

### 2.1 データ元

**国土数値情報 地価公示・都道府県地価調査**

- URL: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L01-v3_1.html（公示地価）
- URL: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L02-v2_6.html（基準地価）
- 認証: 不要（オープンデータ）
- ライセンス: CC BY 4.0（出典明記が必要）

### 2.2 必要なフィールド

| アプリの型フィールド | API のフィールド | 変換 |
|-------------------|----------------|------|
| `id` | 標準地コード | そのまま使用 |
| `lat` | 緯度 | 数値変換 |
| `lng` | 経度 | 数値変換 |
| `price` | 公示価格（円/m²） | 数値変換 |
| `year` | 調査年 | 数値変換 |
| `address` | 所在地 | そのまま使用 |
| `landUse` | 用途区分 | コードを日本語ラベルに変換（`000`: 住宅地、`003`: 商業地 等） |

### 2.3 取得方法

**方法A: GeoJSON ファイルのダウンロード（推奨）**

```bash
# 公示地価データ（東京都、2025年）
curl -o land-price-tokyo.geojson \
  "https://nlftp.mlit.go.jp/ksj/gml/data/L01/L01-25/L01-25_13_GML.zip"
```

- ZIP 内に GeoJSON（GML 形式）が含まれる
- 都道府県コード `13` = 東京都
- 年次 `25` = 2025年

**方法B: REINFOLIB API**

```
GET https://www.reinfolib.mlit.go.jp/ex-api/external/XIT002
  ?area=13        # 都道府県コード
  &year=2025      # 調査年
```

- 国交省不動産情報ライブラリの Web API
- 認証: API キー（無料登録）
- 応答: JSON

### 2.4 データ変換例

```typescript
// GeoJSON → LandPricePoint
function transformLandPrice(feature: GeoJSON.Feature): LandPricePoint {
  const props = feature.properties!;
  const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
  return {
    id: props["標準地コード"],
    lat,
    lng,
    price: Number(props["公示価格"]),
    year: Number(props["調査年"]),
    address: props["所在地"],
    landUse: LAND_USE_MAP[props["用途区分"]] ?? "その他",
  };
}
```

---

## 3. 人口統計データ

### 3.1 データ元

**e-Stat（政府統計の総合窓口）API**

- URL: https://www.e-stat.go.jp/api/
- API ドキュメント: https://www.e-stat.go.jp/api/api-info/e-stat-manual3-0
- 認証: API キー（無料、ユーザー登録が必要）
- ライセンス: CC BY 4.0

### 3.2 必要なフィールド（令和7年国勢調査 人口等基本集計・確報、公表 2026-09-29）

実装は `backend/services/demographics.py`。全項目が同一ビンテージ（2025年10月1日時点）で、
出典表は `backend/tests/fixtures/census_2025/README.md` に記録している。

| アプリの型フィールド | 統計表の項目 | 統計表ID（e-Stat statsDataId） |
|-------------------|-----------|---------|
| `region` | 市区町村名（`TOKYO_WARDS`、総務省 全国地方公共団体コード 13101–13123） | — |
| `population` | 人口（男女別人口－全国、都道府県、市区町村、総数） | 0004065881（集計結果・原数値） |
| `density` | `population` ÷ 区の面積（国土地理院「令和7年全国都道府県市区町村別面積調（10月1日時点）」、`TOKYO_WARDS` に固定。同表の「面積（参考）」「人口密度」列と一致） | 0004065882 tab 2025_47 / 2025_48（照合のみ） |
| `growthRate` | 5年間の人口増減率（2020年（組替）→2025年） | 0004065882 tab 2025_35（集計結果・原数値） |
| `ageGroups.young` | 15歳未満 人口構成比［年齢別］（国籍総数・総数） | 0004066221 cat03=1（不詳補完値） |
| `ageGroups.working` | 15～64歳 人口構成比 | 0004066221 cat03=2（不詳補完値） |
| `ageGroups.elderly` | 65歳以上 人口構成比 | 0004066221 cat03=3（不詳補完値） |

年齢構成に不詳補完値を使うのは、原数値の構成比が年齢「不詳」を分母に含み 100% にならないため
（公式の結果の概要も不詳補完値を用いる）。各構成比は整数％に四捨五入して返す。

応答エンベロープの `sources` に、項目ごとの年次・統計表ID・ラベルを載せ、画面の出典行はそれを表示する。

### 3.2a 人口推移（東京23区、2000–2025年）— 委託スナップショット

`GET /api/v1/population-trends`（`require_active` 配下）は、コミット済みのスナップショット
`backend/data/population_trends.json` を返す（real-data plan PR 3）。上流はなく、起動時に
`services/population_trends.py` が検証し、ファイルが欠けている・壊れている場合はプロセスが
起動しない（デプロイが失敗する）。レスポンスは `/demographics` と同じ封筒（`status` / `data` /
`sources`）で、`data` は年ごとの 東京23区 行と各区の行、`sources` は年をキーに
年次・統計表ID・ラベルを載せる。

| 年 | 出典 | ID |
|----|------|----|
| 2000 / 2005 / 2010 / 2015 / 2020 | 国勢調査 時系列データ 第6表 年齢（3区分），男女別人口及び年齢別割合－都道府県，市区町村（昭和55年～令和2年）：東京都（各年の調査結果。23区については特別区部＝23区合計、令和2年は 0004065882 の「2020年（組替）」と区ごとに一致） | statInfId 000001085987（EXCEL、公開 2022-03-31） |
| 2025 | 令和7年国勢調査 人口等基本集計（確報）男女別人口（23区の合計） | 0004065881 |

ビルダーは `etl/population_trends.py`（`extract`: 生ワークブック → `backend/tests/fixtures/population_trends/`
の抜粋 CSV と sha256 付きメタ、`build`: 抜粋 + PR 2 の e-Stat 応答 → スナップショット）。テストはスナップ
ショットが同じソースからの再ビルドと一致することを検証する。生ダウンロード（`etl/_downloads/`）はコミットしない。

### 3.3 取得方法

```
GET https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData
  ?appId={ESTAT_API_KEY}
  &statsDataId=0004065881      # 人口（男女別人口）
  &cdArea=13101,13102,...       # 市区町村コード（東京23区）
  &cdCat01=0                   # 総数
# 年齢構成: statsDataId=0004066221&cdCat01=0&cdCat02=0（cat03 = 1/2/3）
# 増減率:   statsDataId=0004065882&cdTab=2025_35
```

**市区町村コード（東京23区）**

| 区 | コード | 区 | コード |
|----|--------|-----|-------|
| 千代田区 | 13101 | 中央区 | 13102 |
| 港区 | 13103 | 新宿区 | 13104 |
| 文京区 | 13105 | 台東区 | 13106 |
| 墨田区 | 13107 | 江東区 | 13108 |
| 品川区 | 13109 | 目黒区 | 13110 |
| 大田区 | 13111 | 世田谷区 | 13112 |
| 渋谷区 | 13113 | 中野区 | 13114 |
| 杉並区 | 13115 | 豊島区 | 13116 |
| 北区 | 13117 | 荒川区 | 13118 |
| 板橋区 | 13119 | 練馬区 | 13120 |
| 足立区 | 13121 | 葛飾区 | 13122 |
| 江戸川区 | 13123 | | |

### 3.4 データ変換例

```typescript
// e-Stat JSON → DemographicsData
function transformDemographics(
  statsData: EStatResponse,
  areaCode: string
): DemographicsData {
  const values = statsData.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE;
  const areaValues = values.filter(v => v["@area"] === areaCode);

  const total = findValue(areaValues, "A1101");        // 人口総数
  const young = findValue(areaValues, "A1301");        // 0-14歳
  const working = findValue(areaValues, "A1302");      // 15-64歳
  const elderly = findValue(areaValues, "A1303");      // 65歳以上
  const area = findValue(areaValues, "A1801");         // 面積

  return {
    region: AREA_NAME_MAP[areaCode],
    population: total,
    density: Math.round(total / area), // 実装では面積は面積調の固定値
    growthRate: 0, // 実装では 0004065882 tab 2025_35 から取得
    ageGroups: {
      young: Math.round((young / total) * 100),
      working: Math.round((working / total) * 100),
      elderly: Math.round((elderly / total) * 100),
    },
  };
}
```

---

## 4. 災害リスクデータ

### 4.1 データ元

**ハザードマップポータルサイト（国土地理院）**

- URL: https://disaportal.gsi.go.jp/
- タイル配信: https://disaportaldata.gsi.go.jp/raster/
- 認証: 不要
- ライセンス: 測量法に基づく複製・使用承認（出典明記で利用可）

### 4.2 必要なフィールド

| アプリの型フィールド | データの出典 |
|-------------------|-----------|
| `id` | 自動生成 |
| `type` | データセット種別（洪水 / 地震 / 土砂 / 津波） |
| `level` | 浸水深・危険度ランクから算出 |
| `region` | 地物の所在する市区町村 |
| `description` | リスク情報のテキスト化 |

### 4.3 取得方法

**方法A: タイルレイヤー（地図上の重畳表示用）**

```
# 洪水浸水想定区域（想定最大規模）
https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png

# 土砂災害警戒区域
https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png

# 津波浸水想定
https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png
```

MapLibre でラスタータイルソースとして追加可能。

**方法B: 国土数値情報 GeoJSON（分析・集計用）**

```bash
# 洪水浸水想定区域（東京都）
curl -o flood-tokyo.zip \
  "https://nlftp.mlit.go.jp/ksj/gml/data/A31/A31-12/A31-12_13_GML.zip"
```

### 4.4 リスクレベル変換

| 浸水深 | level |
|--------|-------|
| 0.5m 未満 | 1 |
| 0.5 - 3m | 2 |
| 3 - 5m | 3 |
| 5 - 10m | 4 |
| 10m 以上 | 5 |

| 地震危険度ランク | level |
|----------------|-------|
| ランク1 | 1 |
| ランク2 | 2 |
| ランク3 | 3 |
| ランク4 | 4 |
| ランク5 | 5 |

---

## 5. 交通データ

### 5.1 データ元（real-data plan PR 4、2026-11-02）

駅の位置・路線名・乗降客数はすべて **国土数値情報 駅別乗降客数データ（S12）** の
委託スナップショット `backend/data/stations.json` から配信する（Architect 決定 3）。
ODPT の実行時クライアント（API キー）はコードパスから外れた。follow-up 3（Architect
決定 A、2026-11-09）で、公共交通オープンデータセンターの公開エンドポイント（キー不要）から
取得した **東京都交通局 乗降者数情報**（CC BY 4.0）を委託ファイルとして取り込み、都営地下鉄・
日暮里・舎人ライナーの駅ごとに東京都交通局の公表値を国土数値情報の値に**併記**する
（`ownFigures`）。合計（日間乗降客・事業者別・乗降客数推移・23区の中での位置）は国土数値情報の
値のまま。クレジットは「東京都交通局・公共交通オープンデータ協議会、東京都交通局 乗降者数情報、
クリエイティブ・コモンズ・ライセンス　表示4.0国際（…）」の改変形。

| 項目 | 値 |
|---|---|
| 駅別乗降客数データ | S12-25（2024年度（令和6年度）版、更新 2026年4月）: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-S12-2024.html — `S12-25_GML.zip` 6,913,743 bytes, sha256 `0785e932…7a28` |
| 行政区域データ | N03-20260101（2026年（令和8年）1月1日時点、東京都）: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html — `N03-20260101_13_GML.zip` 13,153,227 bytes, sha256 `94f10b26…ff16` |
| ライセンス | いずれも「オープンデータ（CC_BY_4.0）」（国土数値情報 利用規約 https://nlftp.mlit.go.jp/ksj/other/agreement.html） |
| クレジット | 加工の形、作成者名なし（決定 12）: 「出典：国土交通省国土数値情報ダウンロードサイト（https://nlftp.mlit.go.jp/ksj/）」／「「国土数値情報（駅別乗降客数データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成」／「「国土数値情報（行政区域データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成」 |
| 区の判定 | S12 の各行（運営会社 × 路線 × 駅、線形）の中点を含む N03 の区ポリゴン（点の包含判定）。端点が別区にまたがる 26 行は中点で決め、スナップショットの `straddlingRows` に記録 |
| 乗降客数の定義 | 乗降客数2024 = 2024年度の1日平均（人/日）。駅の値は事業者ごとの値（重複コード 1・データ有無コード 1 の行）の合計で、乗換客は事業者ごとに数えられる。JR東日本の値は乗車人員を2倍した値（原典資料による）: 新宿・東京・池袋・渋谷・小岩で JR東日本「各駅の乗車人員」2024年度・2023年度の値のちょうど 2 倍であることを確認 |
| ビルド | `python -I etl/stations.py extract`（生 zip → `backend/tests/fixtures/stations/` の抜粋）、`python -I etl/stations.py build`（抜粋 → スナップショット）。標準ライブラリのみ |
| 起動時検証 | `backend/services/transport.py check_at_startup`: ファイルの欠落・不整合はプロセスを止め、デプロイを失敗させる（リクエストでは答えない） |

### 5.2 配信するフィールド（`TransportStation`）

| フィールド | 値 |
|---|---|
| `id` | `s12-{グループコード}-{区コード}` |
| `code` | S12_001g グループコード（300m 以内の同名駅を 1 駅にまとめた単位） |
| `name` | 駅名 + 「駅」 |
| `lat` / `lng` | 線形の中点 |
| `dailyPassengers` | 事業者ごとの値の合計。どの事業者にも値がなければ `null`（0 にはしない） |
| `lines` | 「JR 中央線」「メトロ 4号線丸ノ内線」「都営 10号線新宿線」「ゆりかもめ 東京臨海新交通臨海線」の形 |
| `ward` / `wardCode` | N03 の区名・全国地方公共団体コード |
| `operators[]` | `{ name, lines, passengers }` — 事業者別パネル（T2）の元。合計は乗降客指標（K3）に一致 |
| `note` | 値が他路線駅の行に記載されている駅（重複コード 2）の説明 |
| `ownFigures[]` | `{ operator, line, year, passengers, s12 }` — 東京都交通局の公表値（都営地下鉄 2024年度、日暮里・舎人ライナー 2023年度）と、同じ行の国土数値情報の値（他の行に記載なら `null`）。表示のみで合計には入らない（follow-up 3） |

エンベロープの `sources` は `ridership` / `stations` / `wards` / `trend` / `operatorFigures` ごとに
`{ year, table, label }`（PR 2 の形）。画面の年次表記はすべてここから読む。`total.operatorFigures`
に注記文（事実のみ）とクレジットを載せる。

### 5.3 乗降客数推移（T3）

交通タブの「乗降客数推移」は、S12 の固定パネル（B2: 2018年度と 2020〜2024年度の系列がすべて
そろう行。23区 583 単位中 458 単位）の合計（real-data plan PR 4b、2026-11-09）。2019年度は
描画せず、理由を図に示す（補間しない）。`/api/v1/transport` の `total.trend`
（`panel` / `years` / `gaps` / `views`）で配信し、スナップショットは `backend/data/stations.json`、
パネルは `backend/tests/fixtures/stations/ridership_panel.json`。サンプルデータの面は残っていない
（real-data plan PR 9 でサンプル層を削除）。

## 6. 用途地域データ

### 6.1 データ元（real-data plan PR 6、2026-11-03）

用途地域タブ（面積構成・容積率・建蔽率）と災害タブの用途地域バーは、**国土数値情報
都市計画決定情報データ（A55）** の委託スナップショット `backend/data/zoning.json` から配信する
（Architect 決定 2、2026-11-03）。A29（区ごとの利用条件あり）と東京都都市整備局の
R070331 ファイル（データセットページを直接読めない）は使わない。

| 項目 | 値 |
|---|---|
| 都市計画決定情報データ | A55-24（2024年度（令和6年度）版、更新 2025年11月）: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A55-2024.html — `A55-24_13000_SHP.zip` 51,363,053 bytes, sha256 `330895e5…0962`; 23区の各フォルダの `131xx_youto.shp`（用途地域レイヤ、JGD2011 地理座標、UTF-8）7,285 ポリゴン |
| 行政区域データ | N03-20260101（2026年（令和8年）1月1日時点、東京都）: PR 4 で `backend/tests/fixtures/stations/` に収めた 23 区のポリゴン（`N03-20260101_13_GML.zip` sha256 `94f10b26…ff16`） |
| 時点 | A55 ページの「公表自治体及び掲載データ一覧」`A55_R6_datalist.xlsx`（sha256 `e27222a7…c21a`）のデータ時点年の列を区ごとに読む（way 1）。区の行が決める。中央区は「③」（用途地域）の日付、江戸川区は「都に準ずる」で東京都の行（2024-04-26）。江東区・目黒区・渋谷区・板橋区は記載がなく、画面は「時点：国土数値情報の掲載データ一覧に記載なし」。23区表示は「2021年7月1日〜2024年10月1日（4区は掲載データ一覧に記載なし）」 |
| ライセンス | いずれも「オープンデータ（CC_BY_4.0）」（国土数値情報 利用規約 https://nlftp.mlit.go.jp/ksj/other/agreement.html） |
| クレジット | 加工の形、作成者名なし（決定 12）: 「出典：国土交通省国土数値情報ダウンロードサイト（https://nlftp.mlit.go.jp/ksj/）」／「「国土数値情報（都市計画決定情報データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成」／「「国土数値情報（行政区域データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成」。A55 ページの【重要：データ利用時の注意事項】6 項目を原文のまま用途地域タブ・フッター・LP に表示 |
| 指標 | 区ごとに、用途地域ポリゴンを N03 の区ポリゴンで切り抜いた面積の合計（指定区域）に対する各用途地域の面積割合（合計 100%）。指定区域の割合 = 指定区域 ÷ 区ポリゴン面積（100% を超えない。江戸川区 83.75%、千代田区 99.32%）。容積率・建蔽率は用途地域ごとの面積加重平均と最小〜最大。23区表示は全区の面積加重の合計。面積は平面直角座標系第IX系（EPSG:6677）上で計算 |
| 区分 | A55 のコード 1〜13 と名称（`A55_R6_AttributeCodelist`: 8 = 田園住居地域、9 = 近隣商業地域、…、13 = 工業専用地域。A29 や東京都 GIS の番号とは異なる）。面積のある区分のみ表示 |
| ビルド | `python -I etl/zoning.py extract`（生 zip・xlsx → `backend/tests/fixtures/zoning/` の抜粋。pyshp・shapely・openpyxl）、`python -I etl/zoning.py build`（抜粋 → スナップショット。標準ライブラリのみ）、`python -I etl/zoning.py verify`（千代田区・江戸川区の GeoJSON から面積を再計算して CSV と照合） |
| 起動時検証 | `backend/services/zoning.py check_at_startup`: ファイルの欠落・不整合（割合の合計、指定区域の上限、区分コード、時点の整合、クレジット、注意事項）はプロセスを止め、デプロイを失敗させる |

### 6.2 配信するフィールド（`ZoningComposition`）

`GET /api/v1/zoning` は 23 区の `data` と、23区の構成 `total` を返す。

| フィールド | 値 |
|---|---|
| `region` / `code` | 区名・全国地方公共団体コード（`total` は 東京23区 / 13100） |
| `wardM2` / `designatedM2` / `designatedShare` | N03 区ポリゴンの面積、指定区域の面積、その割合（%、≤ 100） |
| `polygons` / `outsideM2` | ポリゴン数、区ポリゴンの外に出ている部分の面積 |
| `asOf` | `{ date, label, text, basis?, note? }` — 画面はそのまま `text` を表示（23区は `from` / `to` / `missing` も） |
| `types[]` | `{ code, name, m2, share, n, far: { mean, min, max }, bcr: { mean, min, max } }` — A55 のコード順、面積のある区分のみ |

エンベロープの `sources` は `zoning` / `wards` / `asOf` ごとに `{ year, table, label }`
（PR 2 の形）。画面の年次表記はすべてここから読む。地図の用途地域レイヤは塗りなし（対象外）。

---

## 7. API キー管理

### 7.1 必要な API キー

| サービス | 環境変数名 | 取得先 |
|---------|-----------|--------|
| e-Stat | `ESTAT_API_KEY` | https://www.e-stat.go.jp/api/ → ユーザー登録 |
| REINFOLIB | `REINFOLIB_API_KEY` | https://www.reinfolib.mlit.go.jp/ → API利用申請 |

### 7.2 設定方法

```bash
# .env.local（リポジトリにはコミットしない）
ESTAT_API_KEY=your_estat_api_key
REINFOLIB_API_KEY=your_reinfolib_api_key
```

Next.js で使用する場合:
- **サーバーサイドのみ**: `process.env.ESTAT_API_KEY`（API Route / Server Component）
- **クライアントに公開する場合**: `NEXT_PUBLIC_` プレフィックスを付ける（非推奨、キーが露出する）

**推奨**: API キーを含むリクエストは Next.js の API Route (`app/api/`) またはServer Component経由で行い、クライアントには変換済みデータのみを返す。

---

## 8. データ取得の実装パターン

### 8.1 ディレクトリ構造（予定）

```
src/lib/api/
├── land-price.ts       # fetchLandPrices()
├── demographics.ts     # fetchDemographics()
├── disaster-risk.ts    # fetchDisasterRisks()
├── transport.ts        # fetchTransportStations()
├── zoning.ts           # fetchZoningAreas()
└── client.ts           # 共通の fetch ラッパー（エラーハンドリング・リトライ）
```

### 8.2 共通パターン

```typescript
// src/lib/api/client.ts
export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    next: { revalidate: 86400 }, // 24時間キャッシュ
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
```

### 8.3 キャッシュ戦略

| データ | キャッシュ期間 | 理由 |
|--------|-------------|------|
| 地価 | 30日 | 年1回更新のため |
| 人口統計 | 30日 | 年1回更新のため |
| 災害リスク | 7日 | 更新頻度が不定期 |
| 交通 | 30日 | 年1回更新のため |
| 用途地域 | 30日 | 年1回更新のため |
