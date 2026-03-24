# 用途地域データの高速配信戦略

## 問題

東京23区の用途地域ポリゴンは約10万フィーチャー、GeoJSONで50-100MB。ブラウザに直接送ると初回ロード10秒以上。

## 推奨アーキテクチャ: ベクタータイル

```
国土数値情報 GeoJSON
    ↓
tippecanoe (タイル生成)
    ↓
.pmtiles (単一ファイル)
    ↓
Cloudflare R2 / S3 (静的ホスティング)
    ↓
MapLibre GL JS (クライアント)
```

### なぜベクタータイルか

| 方式 | 初回ロード | ズーム/パン | サーバー負荷 |
|------|----------|-----------|-----------|
| GeoJSON 一括 | 10-30秒 | 即座 | 高（大きなJSONを配信） |
| **ベクタータイル** | **0.5秒** | **即座** | **ゼロ（静的ファイル）** |
| サーバーサイドレンダリング | 2-5秒 | リクエスト毎 | 高（タイル毎にレンダリング） |

ベクタータイルは地図のズームレベルに応じて必要な範囲・詳細度のデータだけをロードする。ズーム11では区の概形のみ、ズーム15では個々の筆の境界まで表示。

## 実装手順

### Step 1: データ取得

```bash
# 国土数値情報から用途地域データをダウンロード
curl -o A29-11_13.zip \
  "https://nlftp.mlit.go.jp/ksj/gml/data/A29/A29-11/A29-11_13_GML.zip"
unzip A29-11_13.zip
# GeoJSON に変換（ogr2ogrを使用）
ogr2ogr -f GeoJSON zoning-tokyo.geojson A29-11_13.shp -t_srs EPSG:4326
```

### Step 2: tippecanoe でタイル生成

```bash
# tippecanoe をインストール（macOS）
brew install tippecanoe

# PMTiles 形式でベクタータイルを生成
tippecanoe \
  -o zoning-tokyo.pmtiles \
  -z 16 -Z 10 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  -l zoning \
  zoning-tokyo.geojson
```

- `-z 16`: 最大ズームレベル16（建物レベルの詳細）
- `-Z 10`: 最小ズームレベル10（区の概形）
- `--drop-densest-as-needed`: 低ズームで自動間引き
- 出力: 5-15MB の .pmtiles ファイル（元の1/10以下）

### Step 3: PMTiles をホスティング

**Option A: Cloudflare R2（推奨、安価）**
```bash
# R2 バケットにアップロード
wrangler r2 object put urban-oracle/zoning-tokyo.pmtiles \
  --file zoning-tokyo.pmtiles
```
- HTTP Range Request 対応（PMTiles の必須要件）
- 月10GBまで無料
- CDN 経由で全世界から高速アクセス

**Option B: S3 + CloudFront**
```bash
aws s3 cp zoning-tokyo.pmtiles s3://urban-oracle-tiles/
```

**Option C: GitHub Pages（プロトタイプ用）**
```bash
# リポジトリの public/ に配置するだけ
cp zoning-tokyo.pmtiles public/data/
```
- 100MB制限あり、本番には不向き

### Step 4: MapLibre で表示

```typescript
import { Protocol } from "pmtiles";

// PMTiles プロトコルを登録
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// ソースを追加
map.addSource("zoning", {
  type: "vector",
  url: "pmtiles://https://your-cdn.example.com/zoning-tokyo.pmtiles",
});

// レイヤーを追加（用途地域コードで色分け）
map.addLayer({
  id: "zoning-fill",
  type: "fill",
  source: "zoning",
  "source-layer": "zoning",
  paint: {
    "fill-color": [
      "match", ["get", "用途地域コード"],
      "1", "#2d8a4e",  // 一低住専
      "2", "#6abf69",  // 二低住専
      "8", "#f9a8d4",  // 近隣商業
      "9", "#ef4444",  // 商業
      "#888888"         // デフォルト
    ],
    "fill-opacity": 0.6,
  },
});
```

## バックエンド構成（本番向け）

### タイルサーバーが必要な場合

動的にデータをフィルタ・集計する場合はバックエンドが必要:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  MapLibre    │────▶│  Tile Server  │────▶│  PostGIS    │
│  (Browser)   │     │  (Go/Rust)    │     │  (PostgreSQL)│
└─────────────┘     └──────────────┘     └─────────────┘
```

### 推奨サーバー

| サーバー | 言語 | 特徴 |
|---------|------|------|
| **martin** | Rust | PostGIS から直接ベクタータイル生成。最速 |
| **pg_tileserv** | Go | PostGIS ネイティブ。シンプル |
| **t-rex** | Rust | 設定ファイルベース。柔軟 |
| **Tegola** | Go | 複数データソース対応 |

### martin + PostGIS の構成例

```yaml
# docker-compose.yml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: urbanoracle
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data

  martin:
    image: ghcr.io/maplibre/martin:latest
    ports:
      - "3001:3000"
    environment:
      DATABASE_URL: postgres://postgres:secret@db/urbanoracle
    depends_on:
      - db

volumes:
  pgdata:
```

```sql
-- PostGIS にデータ投入
CREATE TABLE zoning (
  id SERIAL PRIMARY KEY,
  code TEXT,
  label TEXT,
  far NUMERIC,
  bcr NUMERIC,
  geom GEOMETRY(MultiPolygon, 4326)
);

-- GeoJSON をインポート
-- ogr2ogr -f "PostgreSQL" PG:"dbname=urbanoracle" zoning-tokyo.geojson -nln zoning

-- 空間インデックス
CREATE INDEX idx_zoning_geom ON zoning USING GIST (geom);
```

martin が自動的にテーブルをベクタータイルとして配信:
```
GET http://localhost:3001/zoning/{z}/{x}/{y}
```

## 段階的な移行戦略

| フェーズ | 方式 | コスト | 速度 |
|---------|------|--------|------|
| **今** | 区ごとの集計コロプレス（現在の実装） | 無料 | 即座 |
| **Phase 1** | PMTiles を public/ に配置 | 無料 | 0.5秒 |
| **Phase 2** | PMTiles を CDN (R2/S3) にホスト | 月$1-5 | 0.3秒 |
| **Phase 3** | martin + PostGIS で動的タイル | 月$20-50 | 0.3秒 + リアルタイムフィルタ |

### Phase 1 が最もコスパが良い

PMTiles は「タイルサーバー不要」が最大の利点。静的ファイル1つをCDNに置くだけで、数十万ポリゴンを高速表示できる。バックエンドサーバーの運用コスト・メンテナンスがゼロ。

Phase 3（PostGIS）が必要になるのは:
- ユーザーがカスタムフィルタで動的にデータを絞り込む場合
- リアルタイムでデータが更新される場合
- 複数のデータソースを空間結合する場合（例: 用途地域 × 災害リスク × 地価のクロス分析）
