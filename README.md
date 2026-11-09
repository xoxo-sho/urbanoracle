# UrbanOracle

**東京23区の都市データ可視化ダッシュボード**

地価・人口統計・災害リスク・交通・用途地域のオープンデータを、インタラクティブな地図とチャートで可視化する Web アプリケーション。

**Live:** https://urbanoracle.dxalabs.com

---

## Features

- **コロプレスマップ** — 23区をデータ値で塗り分け。タブ切替で地価/人口密度/災害リスクが連動
- **区クリック選択** — 地図上の区をクリックでダッシュボード全体がフィルタ。ドロップダウンとも同期
- **ホバーツールチップ** — 区にマウスオーバーで人口・密度・地価を即座に確認
- **駅バブルレイヤー** — 交通タブで乗降客数に比例した円を表示
- **7種のチャート** — BarChart, AreaChart, ScatterChart, PieChart, RadarChart, Treemap, 横バー
- **23区全データ** — 人口・密度・成長率・年齢構成・地価・災害リスク・用途地域
- **ライト/ダークテーマ** — OS設定検知 + 手動切替。地図タイルも連動
- **実データのみ** — e-Stat（国勢調査、ライブ）と、コミット済みスナップショット（人口推移・駅別乗降客数・地価公示・用途地域・災害・土地利用）。取得できなかった項目は「取得失敗」と表示し、代わりの値は出さない

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
| Hosting | Cloud Run (asia-northeast1) |
| Auth | Google Identity Platform (`dxalabs-platform` tenant) |

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

サンプルデータはありません。数値は FastAPI バックエンド（`backend/`、`/api/v1/*`、要サインイン）から取得します。`ESTAT_API_KEY` が未設定の場合、`/api/v1/demographics` は 503 を返し、人口統計の面は「取得失敗」と表示されます。

## Commands

| Command | Description |
|---------|------------|
| `npm run dev` | 開発サーバー (Turbopack) |
| `npm run build` | プロダクションビルド + 型チェック |
| `npm test` | テスト実行 (Vitest) |
| `npm run lint` | ESLint |

## Project Structure

One Cloud Run container serves both halves: FastAPI owns `/api/v1/*` and hands
everything else to the Next.js static export (LP at `/`, dashboard at `/app`).

```
src/                  # Next.js — built to a static export, no server runtime
├── app/
│   ├── page.tsx      # Landing page (public)
│   ├── app/page.tsx  # Dashboard (gated)
│   ├── login/        # Sign-in (Google Identity Platform)
│   ├── pending/      # Awaiting activation
│   ├── layout.tsx    # Root layout + SEO
│   ├── error.tsx     # Error boundary
│   └── not-found.tsx # 404 page
├── components/
│   ├── map/          # MapView + MapLegend (MapLibre, client-only)
│   ├── landing/      # LP sections
│   ├── auth/         # Auth UI
│   └── dashboard/    # Charts, tables, selectors
├── data/             # Ward boundaries GeoJSON
├── lib/              # Firebase client, auth context, formatting, chart theme
└── types/            # Shared TypeScript interfaces

backend/              # FastAPI — the API surface and the static-file server
├── main.py           # App entrypoint
├── routers/          # /api/v1 routes (data, auth)
├── services/         # The e-Stat client and the committed snapshots (人口推移, 駅別乗降客数)
├── core/             # Token verification, activation policy, SPA serving
├── db/               # SQLAlchemy models + session
├── middleware/       # Cross-cutting request handling
├── alembic/          # Schema migrations
├── data/             # Static datasets served by the API
└── tests/            # pytest (requires a disposable postgres)
```

There are no Next.js API routes: they were ported to FastAPI so the API keys
live in Secret Manager and never reach the browser bundle.

## Deployment

Push to `main` → `.github/workflows/deploy.yml` (CI → Cloud Build + bundle
verification → Alembic migration job → Cloud Run). Documentation-only commits
skip the deploy; see [`docs/development-guide.md`](docs/development-guide.md)
§7.2.

## Data Sources

| Data | Source | License |
|------|--------|---------|
| 人口統計 | e-Stat API (国勢調査) | e-Stat 利用規約 (政府標準利用規約 第2.0版準拠) + API 利用規約 第7条のクレジット表示 |
| 駅別乗降客数・駅の位置・区の判定 | 国土数値情報 S12 駅別乗降客数データ（2024年度版）・N03 行政区域データ（2026年） | オープンデータ（CC BY 4.0）、加工の形でクレジット |
| 区境界 | dataofjapan/land (TopoJSON, 出典：地球地図日本) | 配布元に準ずる |
| 災害リスク | ハザードマップポータルサイト | 公共データ利用規約 (PDL1.0) |
| 地図タイル | 地理院タイル 淡色地図 (国土地理院) | 国土地理院コンテンツ利用規約 (PDL1.0) |

地価（国土数値情報 地価公示 L01-26）、用途地域（同 都市計画決定情報 A55-24）、災害（東京都 地震に関する地域危険度測定調査 第9回、国土数値情報 A31a・A33・A40・A49）、土地利用（東京都 土地利用現況調査 令和3年）、人口推移（国勢調査 時系列）、乗降客数推移（国土数値情報 S12）は、コミット済みスナップショット（`backend/data/`）から配信します。出典・時点・クレジットの文言は画面のフッターと `src/lib/credits.ts` にあります。不動産情報ライブラリの取得は削除済みで、サンプルデータはありません。

## Docs

- [`docs/requirements.md`](docs/requirements.md) — 要件定義
- [`docs/development-guide.md`](docs/development-guide.md) — 開発手順
- [`docs/data-sources.md`](docs/data-sources.md) — データソース仕様
- [`docs/tile-server-strategy.md`](docs/tile-server-strategy.md) — ベクタータイル戦略

## License

MIT
