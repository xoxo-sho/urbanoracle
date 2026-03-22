# UrbanOracle データソース仕様書

## 1. データカテゴリ一覧

| カテゴリ | データ元 | 認証 | 形式 | 更新頻度 | 対応する型 |
|---------|---------|------|------|---------|-----------|
| 地価 | 国土数値情報 (MLIT) | 不要 | GeoJSON | 年1回（3月） | `LandPricePoint` |
| 人口統計 | e-Stat API | API キー（無料） | JSON | 年1回（国勢調査） | `DemographicsData` |
| 災害リスク | ハザードマップポータル | 不要 | タイル / GeoJSON | 不定期 | `DisasterRisk` |
| 交通 | ODPT / 国土数値情報 | API キー（無料） | JSON-LD / GeoJSON | 年1回 | `TransportStation` |
| 用途地域 | 国土数値情報 (MLIT) | 不要 | GeoJSON / Shapefile | 年1回 | `ZoningArea` |

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

### 3.2 必要なフィールド

| アプリの型フィールド | 統計表の項目 | 統計表ID |
|-------------------|-----------|---------|
| `region` | 市区町村名 | — |
| `population` | 人口総数 | 国勢調査 (0003448850) |
| `density` | 人口密度 | 国勢調査 |
| `growthRate` | 人口増減率 | 住民基本台帳 (0003427920) |
| `ageGroups.young` | 年少人口（0-14歳）割合 | 国勢調査 |
| `ageGroups.working` | 生産年齢人口（15-64歳）割合 | 国勢調査 |
| `ageGroups.elderly` | 老年人口（65歳以上）割合 | 国勢調査 |

### 3.3 取得方法

```
GET https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData
  ?appId={ESTAT_API_KEY}
  &statsDataId=0003448850      # 国勢調査 人口等基本集計
  &cdArea=13101,13102,...       # 市区町村コード（東京23区）
  &cdCat01=A1101               # 人口総数
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
    density: Math.round(total / area),
    growthRate: 0, // 別の統計表から取得
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

### 5.1 データ元

**公共交通オープンデータセンター（ODPT）**

- URL: https://developer.odpt.org/
- API ドキュメント: https://developer.odpt.org/documents
- 認証: API キー（無料、デベロッパー登録が必要）
- ライセンス: CC BY 4.0（事業者により異なる）

**補助: 国土数値情報 鉄道データ**

- URL: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-v3_1.html
- 認証: 不要
- 形式: GeoJSON

### 5.2 必要なフィールド

| アプリの型フィールド | ODPT のフィールド | 変換 |
|-------------------|-----------------|------|
| `id` | `owl:sameAs` | URI → 短縮ID |
| `name` | `dc:title` | そのまま使用 |
| `lat` | `geo:lat` | 数値 |
| `lng` | `geo:long` | 数値 |
| `type` | `odpt:stationType` | `"odpt.StationType:Train"` → `"train"` |
| `dailyPassengers` | `odpt:passengerSurvey` | 別 API で取得 |
| `lines` | `odpt:railway` | 路線URIを日本語名に変換 |

### 5.3 取得方法

```
# 駅一覧（東京都内）
GET https://api.odpt.org/api/v4/odpt:Station
  ?acl:consumerKey={ODPT_API_KEY}
  &odpt:operator=odpt.Operator:JR-East,odpt.Operator:TokyoMetro,odpt.Operator:Toei

# 乗降客数データ
GET https://api.odpt.org/api/v4/odpt:PassengerSurvey
  ?acl:consumerKey={ODPT_API_KEY}
  &odpt:operator=odpt.Operator:JR-East
```

### 5.4 データ変換例

```typescript
// ODPT Station → TransportStation
function transformStation(
  station: ODPTStation,
  passengers: number,
  lines: string[]
): TransportStation {
  return {
    id: station["owl:sameAs"].replace("odpt.Station:", ""),
    name: station["dc:title"],
    lat: station["geo:lat"],
    lng: station["geo:long"],
    type: "train",
    dailyPassengers: passengers,
    lines,
  };
}
```

---

## 6. 用途地域データ

### 6.1 データ元

**国土数値情報 用途地域データ**

- URL: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A29-v2_1.html
- 認証: 不要
- 形式: GeoJSON / Shapefile
- ライセンス: CC BY 4.0

### 6.2 必要なフィールド

| アプリの型フィールド | GeoJSON のプロパティ | 変換 |
|-------------------|-------------------|------|
| `id` | 自動生成 | — |
| `type` | `用途地域コード` | コードをキーに変換 |
| `label` | `用途地域コード` | コードを日本語ラベルに変換 |
| `color` | — | `type` に基づいてカラーマップから取得 |
| `maxFloorAreaRatio` | `容積率` | 数値（%） |
| `maxBuildingCoverage` | `建蔽率` | 数値（%） |

### 6.3 用途地域コード一覧

| コード | 用途地域 | 推奨カラー |
|--------|---------|-----------|
| 1 | 第一種低層住居専用地域 | `#2d8a4e` |
| 2 | 第二種低層住居専用地域 | `#6abf69` |
| 3 | 第一種中高層住居専用地域 | `#a8d5a2` |
| 4 | 第二種中高層住居専用地域 | `#c5e6c0` |
| 5 | 第一種住居地域 | `#fef3a8` |
| 6 | 第二種住居地域 | `#fde68a` |
| 7 | 準住居地域 | `#fbbf24` |
| 8 | 近隣商業地域 | `#f9a8d4` |
| 9 | 商業地域 | `#ef4444` |
| 10 | 準工業地域 | `#c4b5fd` |
| 11 | 工業地域 | `#93c5fd` |
| 12 | 工業専用地域 | `#60a5fa` |

### 6.4 取得方法

```bash
# 用途地域データ（東京都）
curl -o zoning-tokyo.zip \
  "https://nlftp.mlit.go.jp/ksj/gml/data/A29/A29-11/A29-11_13_GML.zip"
```

GeoJSON のポリゴンとして取得し、MapLibre の `fill` レイヤーとして描画する。

---

## 7. API キー管理

### 7.1 必要な API キー

| サービス | 環境変数名 | 取得先 |
|---------|-----------|--------|
| e-Stat | `ESTAT_API_KEY` | https://www.e-stat.go.jp/api/ → ユーザー登録 |
| ODPT | `ODPT_API_KEY` | https://developer.odpt.org/ → デベロッパー登録 |
| REINFOLIB | `REINFOLIB_API_KEY` | https://www.reinfolib.mlit.go.jp/ → API利用申請 |

### 7.2 設定方法

```bash
# .env.local（リポジトリにはコミットしない）
ESTAT_API_KEY=your_estat_api_key
ODPT_API_KEY=your_odpt_api_key
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
