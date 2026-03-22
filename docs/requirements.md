# UrbanOracle 要件定義書

## 1. プロジェクト概要

### 1.1 目的

日本の都市に関するオープンデータを集約・可視化し、地価・人口動態・災害リスク・交通・用途地域などの情報を一画面で直感的に把握できる Web ダッシュボードを構築する。

### 1.2 ターゲットユーザー

- 不動産投資家・デベロッパー
- 都市計画・建築関連の専門家
- 行政・自治体の政策立案者
- 都市データに関心のある研究者・学生

### 1.3 解決する課題

| 課題 | UrbanOracle の解決策 |
|------|---------------------|
| 都市データが複数の省庁サイトに分散している | 単一のダッシュボードに集約 |
| 地価・災害リスク・交通の相関が見えにくい | 同一地図上でのレイヤー重畳表示 |
| 生データは専門家以外に読み解きにくい | チャート・地図・インサイトカードで視覚化 |
| 既存ツールの多くが英語 or 有料 | 日本語 UI、オープンデータ・OSS で無料 |

---

## 2. 機能要件

### 2.1 データカテゴリ

| カテゴリ | データ内容 | データソース（予定） |
|---------|-----------|-------------------|
| 地価 | 公示地価・基準地価（円/m²） | 国土数値情報 API |
| 人口統計 | 人口・人口密度・増減率・年齢構成 | e-Stat API |
| 災害リスク | 洪水・地震・土砂災害・津波のリスクレベル | ハザードマップポータルサイト |
| 交通 | 鉄道駅・バス停・乗降客数・路線情報 | 国土数値情報 / ODPT |
| 用途地域 | 用途地域区分・容積率・建蔽率 | 国土数値情報 API |

### 2.2 地図機能

| 機能 | 説明 | 優先度 |
|------|------|--------|
| ベースマップ表示 | ダークテーマの地図カード（CARTO Dark） | P0 |
| データポイント表示 | 地価等のマーカーを地図上にプロット | P0 |
| ポップアップ | マーカークリックで詳細情報表示 | P0 |
| レイヤー切替 | データカテゴリごとの表示 ON/OFF | P0 |
| ヒートマップ | 地価・人口密度のヒートマップレイヤー | P1 |
| エリア塗り分け | 用途地域のポリゴン塗り分け表示 | P1 |
| 3D ビュー | 建物高さの 3D 表示（pitch 操作） | P2 |

### 2.3 ダッシュボードパネル

| 機能 | 説明 | 優先度 |
|------|------|--------|
| 統計サマリー | データ件数のサマリーバー | P0 |
| 人口チャート | 区別人口棒グラフ・増減率バー・年齢構成 | P0 |
| 災害リスク一覧 | リスクレベル付きカードリスト | P0 |
| 交通ランキング | 乗降客数ランキング + 路線情報 | P0 |
| インサイトカード | 各タブの「最も重要な1つの数字」を強調表示 | P0 |
| 地価チャート | エリア別地価推移（折れ線グラフ） | P1 |
| 地域比較 | 2地域の並列比較ビュー | P2 |
| データエクスポート | CSV/JSON ダウンロード | P2 |

### 2.4 UI/UX 要件

| 要件 | 仕様 |
|------|------|
| テーマ | ダークモード（OKLCh カラー） |
| レイアウト | ダッシュボードグリッド（地図はデータパネルの1つ） |
| Glass エフェクト | backdrop-blur(32px) + 半透明背景 |
| アニメーション | マーカーパルス、フェードイン、カウントアップ |
| レスポンシブ | デスクトップ: サイドパネル表示、モバイル: パネル非表示（トグル） |
| 言語 | UI テキスト・データラベルは日本語、コードは英語 |
| アクセシビリティ | WCAG 2.1 コントラスト比 4.5:1 以上 |

---

## 3. 非機能要件

### 3.1 パフォーマンス

| 指標 | 目標値 |
|------|--------|
| 初回読み込み（LCP） | 2.5 秒以内 |
| 地図操作のフレームレート | 60fps |
| サイドパネルの描画 | 100ms 以内 |
| ビルド時間 | 30 秒以内 |

### 3.2 ブラウザ対応

| ブラウザ | バージョン |
|---------|-----------|
| Chrome | 最新2バージョン |
| Firefox | 最新2バージョン |
| Safari | 最新2バージョン |
| Edge | 最新2バージョン |

### 3.3 技術制約

| 項目 | 制約 |
|------|------|
| SSR | MapView はクライアントオンリー（`next/dynamic` + `ssr: false`） |
| 地図ライブラリ | MapLibre GL JS（OSS、Mapbox 互換） |
| タイルサーバー | 外部サービス依存（CARTO / OpenStreetMap） |
| データ更新頻度 | 公示地価: 年1回、人口: 年1回、災害: 不定期 |

---

## 4. データモデル

### 4.1 型定義

```typescript
type DataCategory =
  | "land-price"
  | "demographics"
  | "disaster-risk"
  | "transportation"
  | "zoning";

interface DataLayer {
  id: DataCategory;
  label: string;        // 日本語ラベル
  description: string;  // 日本語説明
  color: string;        // レイヤー識別色
  enabled: boolean;     // 表示状態
}

interface LandPricePoint {
  id: string;
  lat: number;
  lng: number;
  price: number;        // 円/m²
  year: number;
  address: string;
  landUse: string;
}

interface DemographicsData {
  region: string;
  population: number;
  density: number;      // 人/km²
  growthRate: number;   // %
  ageGroups: {
    young: number;      // 0-14歳 (%)
    working: number;    // 15-64歳 (%)
    elderly: number;    // 65歳以上 (%)
  };
}

interface DisasterRisk {
  id: string;
  type: "flood" | "earthquake" | "landslide" | "tsunami";
  level: 1 | 2 | 3 | 4 | 5;
  region: string;
  description: string;
}

interface TransportStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: "train" | "bus" | "subway";
  dailyPassengers: number;
  lines: string[];
}

interface ZoningArea {
  id: string;
  type: string;
  label: string;
  color: string;
  maxFloorAreaRatio: number;    // 容積率 (%)
  maxBuildingCoverage: number;  // 建蔽率 (%)
}
```

---

## 5. 外部 API 連携（予定）

### 5.1 国土数値情報 API

- **URL**: https://nlftp.mlit.go.jp/
- **用途**: 地価・用途地域・交通データ
- **形式**: GeoJSON / Shapefile
- **認証**: 不要（オープンデータ）

### 5.2 e-Stat API

- **URL**: https://www.e-stat.go.jp/api/
- **用途**: 国勢調査・人口統計
- **形式**: JSON / CSV
- **認証**: API キー（無料登録）

### 5.3 ハザードマップポータル

- **URL**: https://disaportal.gsi.go.jp/
- **用途**: 洪水・土砂災害・津波リスク
- **形式**: タイル画像 / GeoJSON
- **認証**: 不要

### 5.4 公共交通オープンデータ (ODPT)

- **URL**: https://developer.odpt.org/
- **用途**: 鉄道路線・駅・時刻表
- **形式**: JSON-LD
- **認証**: API キー（無料登録）

---

## 6. マイルストーン

| フェーズ | 内容 | 状態 |
|---------|------|------|
| Phase 0 | プロジェクトセットアップ・技術選定 | 完了 |
| Phase 1 | 地図表示 + サンプルデータでのダッシュボード | 完了 |
| Phase 2 | UI/UX リファイン（Glass UI、アニメーション） | 完了 |
| Phase 3 | 実データ API 連携（国土数値情報・e-Stat） | 未着手 |
| Phase 4 | ヒートマップ・ポリゴン表示・3D ビュー | 未着手 |
| Phase 5 | レスポンシブ対応・パフォーマンス最適化 | 未着手 |
| Phase 6 | デプロイ・CI/CD・モニタリング | 未着手 |
