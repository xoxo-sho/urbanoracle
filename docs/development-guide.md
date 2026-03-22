# UrbanOracle 開発手順書

## 1. 環境構築

### 1.1 前提条件

| ツール | バージョン |
|--------|-----------|
| Node.js | 20.x 以上 |
| npm | 10.x 以上 |
| Git | 2.x 以上 |

### 1.2 セットアップ

```bash
# リポジトリのクローン
git clone https://github.com/xoxo-sho/urbanoracle.git
cd urbanoracle

# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev
```

ブラウザで http://localhost:3000 を開く。

### 1.3 利用可能なコマンド

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動（Turbopack） |
| `npm run build` | プロダクションビルド + TypeScript 型チェック |
| `npm run start` | プロダクションサーバー起動 |
| `npm run lint` | ESLint 実行 |

---

## 2. 技術スタック

| レイヤー | 技術 | バージョン |
|---------|------|-----------|
| フレームワーク | Next.js (App Router) | 16.x |
| 言語 | TypeScript (strict) | 5.x |
| UI | React | 19.x |
| スタイリング | Tailwind CSS | 4.x |
| UI コンポーネント | shadcn/ui + Base UI | - |
| 地図 | MapLibre GL JS | 5.x |
| チャート | Recharts | 3.x |
| アイコン | Lucide React | - |

---

## 3. ディレクトリ構造

```
src/
├── app/
│   ├── layout.tsx          # ルートレイアウト（html/body設定）
│   ├── page.tsx            # メインページ（状態管理・レイアウト構成）
│   └── globals.css         # グローバルCSS（テーマ・Glass・アニメーション）
│
├── components/
│   ├── map/
│   │   └── MapView.tsx     # MapLibre地図（dynamic import, SSR無効）
│   ├── dashboard/
│   │   ├── LayerSelector.tsx      # データレイヤー切替
│   │   ├── StatsBar.tsx           # 統計サマリーバー
│   │   ├── DemographicsChart.tsx  # 人口統計チャート
│   │   ├── DisasterRiskPanel.tsx  # 災害リスクパネル
│   │   └── TransportPanel.tsx     # 交通データパネル
│   └── ui/                 # shadcn/ui コンポーネント
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── separator.tsx
│       └── tabs.tsx
│
├── types/
│   └── index.ts            # 共有型定義（全データカテゴリ）
│
├── data/
│   └── sample.ts           # サンプルデータ（→ API に置換予定）
│
└── lib/
    └── utils.ts            # ユーティリティ（cn関数）
```

---

## 4. アーキテクチャ

### 4.1 レイアウト構造

```
┌──────────────────────────────────────────────────┐
│  Header: Logo │ Layer Selector │ Stats Bar        │
├──────────────────────┬───────────────────────────┤
│                      │                           │
│  Map                 │  Tabs: [人口統計│災害リスク]│
│  (データパネルの1つ)   │                           │
│  ┌──────────────┐    │  ┌───────────────────────┐│
│  │ 地価データ    │    │  │ チャート / リスト      ││
│  │ N地点        │    │  │                       ││
│  └──────────────┘    │  │                       ││
│                      │  └───────────────────────┘│
├──────────────────────┤                           │
│  Transport Panel     │                           │
│  (乗降客数ランキング) │                           │
│                      │                           │
└──────────────────────┴───────────────────────────┘
```

- **ダッシュボードが主役**: 12カラムグリッドで各データパネルを配置
- **地図は1セクション**: 左カラム（5/12幅）に配置。全画面ではなく、ボーダー付きカードとして表示
- **右カラム**: タブ切替で人口統計・災害リスクを表示（7/12幅）
- **Glass エフェクト**: パネル内のオーバーレイ要素に使用（レイアウト全体ではない）

### 4.2 データフロー

```
sample.ts (静的データ)
    ↓  ※将来は API から取得
page.tsx (状態管理: layers)
    ├── Header
    │   ├── LayerSelector (layers → 表示切替)
    │   └── StatsBar (サマリー表示)
    └── Grid (12カラム)
        ├── 左カラム (5/12)
        │   ├── MapView (landPrices → マーカー描画)
        │   └── TransportPanel (stations → ランキング)
        └── 右カラム (7/12)
            └── Tabs
                ├── DemographicsChart (demographics → チャート)
                └── DisasterRiskPanel (risks → カードリスト)
```

### 4.3 重要な設計パターン

#### MapView はクライアントオンリー

MapLibre GL JS は DOM を必要とするため、SSR では動作しない。

```tsx
// page.tsx
const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
});
```

**ルール**: `src/components/map/` 配下のコンポーネントはすべて `"use client"` が必須。

#### Glass ユーティリティ

`globals.css` に定義された Glass クラスを使用する。

```tsx
// 通常の Glass（72% 不透明）
<div className="glass rounded-2xl p-4">...</div>

// 強い Glass（85% 不透明、テキストが多い場合）
<div className="glass-strong rounded-2xl p-4">...</div>
```

#### カラーシステム

CSS カスタムプロパティ（OKLCh）を使用。Tailwind のデフォルト色は使わない。

```tsx
// NG
<p className="text-gray-500">...</p>

// OK
<p className="text-muted-foreground">...</p>
```

---

## 5. 開発ワークフロー

### 5.1 新しいデータパネルの追加

1. **型定義**: `src/types/index.ts` にインターフェースを追加
2. **サンプルデータ**: `src/data/sample.ts` にテストデータを追加
3. **コンポーネント作成**: `src/components/dashboard/` にパネルコンポーネントを作成
4. **ページに統合**: `src/app/page.tsx` の Tabs にタブを追加

### 5.2 shadcn/ui コンポーネントの追加

```bash
npx shadcn@latest add <component-name>
```

コンポーネントは `src/components/ui/` に生成される。

### 5.3 地図レイヤーの追加

1. `src/types/index.ts` の `DataCategory` に新しいカテゴリを追加
2. `src/data/sample.ts` の `dataLayers` 配列に新しいレイヤーを追加
3. `src/components/map/MapView.tsx` で新しいデータタイプの描画ロジックを追加

### 5.4 API 連携の実装（Phase 3）

サンプルデータを API 呼び出しに置換する手順:

1. `src/lib/api/` ディレクトリを作成
2. 各データソース用のフェッチ関数を作成:

```typescript
// src/lib/api/land-price.ts
export async function fetchLandPrices(
  bounds: { north: number; south: number; east: number; west: number }
): Promise<LandPricePoint[]> {
  const res = await fetch(`https://...`);
  const data = await res.json();
  return transformToLandPricePoints(data);
}
```

3. `page.tsx` で `useEffect` + `useState` に置換（または React Server Components で fetch）
4. ローディング状態・エラーハンドリングを追加

---

## 6. スタイリングガイド

### 6.1 テーマトークン

| トークン | 用途 | 値 |
|---------|------|-----|
| `--background` | ページ背景 | `oklch(0.11 0.015 265)` |
| `--card` | カード背景 | `oklch(0.14 0.012 265)` |
| `--primary` | アクセントカラー | `oklch(0.72 0.19 250)` |
| `--muted-foreground` | 補助テキスト | `oklch(0.58 0 0)` |
| `--border` | ボーダー | `oklch(1 0 0 / 7%)` |
| `--glass-bg` | Glass 背景 | `oklch(0.12 0.015 265 / 72%)` |

### 6.2 チャートカラー

| トークン | 色 | 用途 |
|---------|-----|------|
| `--chart-1` | Blue | 人口・メインデータ |
| `--chart-2` | Teal | 交通・成長率 |
| `--chart-3` | Orange | 災害・警告 |
| `--chart-4` | Purple | 用途地域 |
| `--chart-5` | Yellow | 地価 |

### 6.3 アニメーション

| クラス | 効果 | 用途 |
|--------|------|------|
| `animate-fade-in-up` | フェードイン + 上方向スライド | リスト項目の時差表示 |
| `animate-count-up` | フェードイン + 上方向スライド | 数値の登場 |
| `shimmer` | シマーエフェクト | ローディング状態 |

時差表示の例:

```tsx
{items.map((item, i) => (
  <div
    className="animate-fade-in-up"
    style={{ animationDelay: `${i * 0.05}s`, opacity: 0 }}
  >
    ...
  </div>
))}
```

---

## 7. ビルド・デプロイ

### 7.1 プロダクションビルド

```bash
npm run build
```

TypeScript 型チェック + Next.js ビルドが実行される。エラーがあるとビルドが失敗する。

### 7.2 デプロイ（Vercel 推奨）

```bash
# Vercel CLI でデプロイ
npx vercel

# または GitHub 連携で自動デプロイ
# 1. Vercel Dashboard で GitHub リポジトリを接続
# 2. main ブランチへの push で自動デプロイ
```

### 7.3 環境変数（API 連携時）

```bash
# .env.local
ESTAT_API_KEY=your_api_key_here
ODPT_API_KEY=your_api_key_here
```

`.env.local` は `.gitignore` に含まれているため、リポジトリにはコミットされない。

---

## 8. トラブルシューティング

### 地図が表示されない

- MapLibre はクライアントオンリー。`"use client"` ディレクティブがあるか確認
- `next/dynamic` で `ssr: false` を指定しているか確認
- コンテナ要素に明示的な `width` と `height` が設定されているか確認
- `ResizeObserver` で `map.resize()` を呼んでいるか確認

### ビルドエラー: 型エラー

```bash
npm run build
```

`npm run build` は TypeScript の型チェックも行う。型エラーがある場合はビルドが失敗する。

### shadcn/ui コンポーネントのエラー

shadcn/ui のバージョンと Next.js 16 の互換性に注意。Base UI ベースのコンポーネントが使われている。

```bash
# コンポーネントの再インストール
npx shadcn@latest add <component-name> --overwrite
```
