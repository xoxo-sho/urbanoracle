# UrbanOracle

**東京23区の都市データ可視化ダッシュボード**

地価・人口統計・災害リスク・交通・用途地域のオープンデータを、インタラクティブな地図とチャートで可視化する Web アプリケーション。

**Live:** https://urbanoracle-seven.vercel.app

---

## Features

- **コロプレスマップ** — 23区をデータ値で塗り分け。タブ切替で地価/人口密度/災害リスクが連動
- **区クリック選択** — 地図上の区をクリックでダッシュボード全体がフィルタ。ドロップダウンとも同期
- **ホバーツールチップ** — 区にマウスオーバーで人口・密度・地価を即座に確認
- **駅バブルレイヤー** — 交通タブで乗降客数に比例した円を表示
- **7種のチャート** — BarChart, AreaChart, ScatterChart, PieChart, RadarChart, Treemap, 横バー
- **23区全データ** — 人口・密度・成長率・年齢構成・地価・災害リスク・用途地域
- **ライト/ダークテーマ** — OS設定検知 + 手動切替。地図タイルも連動
- **API連携** — e-Stat（国勢調査）、REINFOLIB（不動産取引価格）。取得失敗時はサンプルデータにフォールバック

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Map | MapLibre GL JS |
| Charts | Recharts |
| Icons | Lucide React |
| Testing | Vitest + Testing Library |
| CI/CD | GitHub Actions |
| Hosting | Vercel |

## Getting Started

```bash
git clone https://github.com/xoxo-sho/urbanoracle.git
cd urbanoracle
npm install
npm run dev
```

http://localhost:3000 を開く。

### 環境変数（オプション）

実データ API に接続する場合:

```bash
cp .env.example .env.local
# .env.local に API キーを設定
```

| 変数 | 用途 | 取得先 |
|------|------|--------|
| `ESTAT_API_KEY` | 人口統計（国勢調査） | https://www.e-stat.go.jp/api/ |
| `REINFOLIB_API_KEY` | 不動産取引価格 | https://www.reinfolib.mlit.go.jp/ |

API キー未設定でもサンプルデータで動作します。

## Commands

| Command | Description |
|---------|------------|
| `npm run dev` | 開発サーバー (Turbopack) |
| `npm run build` | プロダクションビルド + 型チェック |
| `npm test` | テスト実行 (Vitest) |
| `npm run lint` | ESLint |

## Project Structure

```
src/
├── app/
│   ├── api/          # API Routes (land-prices, demographics, etc.)
│   ├── page.tsx      # Main dashboard
│   ├── layout.tsx    # Root layout + SEO
│   ├── error.tsx     # Error boundary
│   └── not-found.tsx # 404 page
├── components/
│   ├── map/          # MapView + MapLegend (MapLibre, client-only)
│   └── dashboard/    # Charts, tables, selectors (17 components)
├── data/             # Sample data + ward boundaries GeoJSON
├── lib/              # API clients + chart theme
└── types/            # Shared TypeScript interfaces
```

## Data Sources

| Data | Source | License |
|------|--------|---------|
| 地価 | 不動産情報ライブラリ (REINFOLIB) | Government Open Data |
| 人口統計 | e-Stat API (国勢調査) | CC BY 4.0 |
| 区境界 | dataofjapan/land (TopoJSON) | Open Data |
| 災害リスク | ハザードマップポータル | Government Open Data |
| 地図タイル | CARTO + OpenStreetMap | ODbL |

## Docs

- [`docs/requirements.md`](docs/requirements.md) — 要件定義
- [`docs/development-guide.md`](docs/development-guide.md) — 開発手順
- [`docs/data-sources.md`](docs/data-sources.md) — データソース仕様
- [`docs/tile-server-strategy.md`](docs/tile-server-strategy.md) — ベクタータイル戦略

## License

MIT
