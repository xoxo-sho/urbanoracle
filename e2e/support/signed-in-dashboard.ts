import fs from "node:fs";
import path from "node:path";
import type { BrowserContext } from "@playwright/test";

/**
 * The signed-in dashboard, without any real identity, for specs that run
 * against the built static export (e2e/app-credits.spec.ts, e2e/app-ui.spec.ts).
 *
 * Firebase's persisted user is seeded in localStorage and accounts:lookup is
 * answered here; every /api/v1/* call is answered from the committed snapshots
 * under backend/data/. The map tiles themselves are real network requests.
 */

const DEFAULT_EMAIL = "e2e-credits@example.com";
const REPO = path.join(__dirname, "..", "..");
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "structural-check-build";
const USER_KEY = `firebase:authUser:${API_KEY}:[DEFAULT]`;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "content-type": "application/json" };
const SERVES_EXPORT = !process.env.APP_CREDITS_BASE_URL;

// /demographics answers with a real-shaped fixture (the sample set it used
// to fall back to left in real-data plan PR 1); /transport answers from the
// committed 国土数値情報 station snapshot itself (PR 4); /disaster-risks from the
// committed 災害 snapshot (PR 7) — the sample list it used to serve is gone;
// /green-land-use from the committed 土地利用 snapshot (PR 8).
const disaster = JSON.parse(fs.readFileSync(path.join(REPO, "backend", "data", "disaster_risks.json"), "utf8")) as {
  sources: Record<string, unknown>;
  total: { name: string } & Record<string, unknown>;
  wards: ({ name: string } & Record<string, unknown>)[];
};
const green = JSON.parse(fs.readFileSync(path.join(REPO, "backend", "data", "green_land_use.json"), "utf8")) as typeof disaster;
const disasterRecord = ({ name, ...rest }: { name: string } & Record<string, unknown>) => ({ ...rest, region: name });
const live = JSON.parse(fs.readFileSync(path.join(REPO, "e2e", "fixtures", "live-api.json"), "utf8"));
interface SnapshotStation {
  code: string;
  name: string;
  ward: string;
  wardCode: string;
  lat: number;
  lng: number;
  dailyPassengers: number | null;
  operators: { name: string; lines: string[]; passengers: number | null }[];
  note?: string;
  remarks?: unknown[];
  countedElsewhere?: unknown;
  // Follow-up 3: the operator's own published figure per line, beside S12's.
  ownFigures?: unknown[];
}
export const stationsSnapshot = JSON.parse(fs.readFileSync(path.join(REPO, "backend", "data", "stations.json"), "utf8")) as {
  sources: Record<string, unknown>;
  credit: Record<string, string>;
  // 乗降客数推移 (real-data plan PR 4b): the panel series the route sends beside `data`.
  trend: { panel: { id: string }; years: number[]; gaps: { year: number; text: string }[]; views: { name: string; units: number; panelUnits: number }[] };
  // Follow-up 3: whose figures the stations' ownFigures are, the notice and the counts (sent as total.operatorFigures).
  operatorFigures: { publisher: string; years: unknown[]; stationLines: number; below: Record<string, number>; notice: string[] };
  stations: SnapshotStation[];
};
const OPERATOR_PREFIX: Record<string, string> = { 東日本旅客鉄道: "JR", 東京地下鉄: "メトロ", 東京都: "都営" };
const stationRows = stationsSnapshot.stations.map((s) => ({
  id: `s12-${s.code}-${s.wardCode}`,
  code: s.code,
  name: s.name.endsWith("駅") ? s.name : `${s.name}駅`,
  lat: s.lat,
  lng: s.lng,
  type: "train",
  dailyPassengers: s.dailyPassengers,
  lines: s.operators.flatMap((o) => o.lines.map((line) => `${OPERATOR_PREFIX[o.name] ?? o.name} ${line}`)),
  ward: s.ward,
  wardCode: s.wardCode,
  operators: s.operators,
  ...(s.remarks ? { remarks: s.remarks } : {}),
  ...(s.countedElsewhere ? { countedElsewhere: s.countedElsewhere } : {}),
  ...(s.note ? { note: s.note } : {}),
  ...(s.ownFigures ? { ownFigures: s.ownFigures } : {}),
}));
// The 人口推移 snapshot route (real-data plan PR 3) answers from the committed snapshot itself.
interface SnapshotPoint {
  year: number;
  population: number;
  wards: { name: string; population: number }[];
}
const trends = JSON.parse(fs.readFileSync(path.join(REPO, "backend", "data", "population_trends.json"), "utf8")) as {
  region: string;
  sources: Record<string, unknown>;
  points: SnapshotPoint[];
};
const trendRows = trends.points.flatMap((p) => [
  { year: p.year, population: p.population, region: trends.region },
  ...p.wards.map((w) => ({ year: p.year, population: w.population, region: w.name })),
]);
// The 地価公示 snapshot route (real-data plan PR 5) answers from the committed snapshot itself.
interface SnapshotLandPriceWard {
  code: string;
  name: string;
  n: number;
  residential: Record<string, number | null>;
  commercial: Record<string, number | null>;
  industrial: { n: number };
}
const landPrices = JSON.parse(fs.readFileSync(path.join(REPO, "backend", "data", "land_prices.json"), "utf8")) as {
  sources: Record<string, unknown>;
  wards: SnapshotLandPriceWard[];
};
const landPriceRows = landPrices.wards.map((w) => ({
  region: w.name,
  code: w.code,
  n: w.n,
  residential: w.residential,
  commercial: w.commercial,
  industrial: w.industrial,
}));
// The 用途地域 snapshot route (real-data plan PR 6) answers from the committed snapshot itself.
interface SnapshotZoningComposition {
  code: string;
  name: string;
  asOf: Record<string, unknown>;
  [key: string]: unknown;
}
const zoning = JSON.parse(fs.readFileSync(path.join(REPO, "backend", "data", "zoning.json"), "utf8")) as {
  sources: Record<string, unknown>;
  total: SnapshotZoningComposition;
  wards: SnapshotZoningComposition[];
};
const zoningRecord = ({ name, asOf, ...rest }: SnapshotZoningComposition) => {
  const { cells: _cells, ...asOfRest } = asOf as { cells?: unknown };
  void _cells;
  return { ...rest, region: name, asOf: asOfRest };
};
const API: Record<string, unknown> = {
  "/api/v1/zoning": { status: "ok", data: zoning.wards.map(zoningRecord), sources: zoning.sources, total: zoningRecord(zoning.total) },
  "/api/v1/demographics": { status: "ok", data: live.demographics, sources: live.sources },
  "/api/v1/land-prices": { status: "ok", data: landPriceRows, sources: landPrices.sources },
  "/api/v1/transport": {
    status: "ok",
    data: stationRows,
    sources: stationsSnapshot.sources,
    // backend/services/transport.py total(): the 23区 record carrying the trend.
    total: {
      code: "13100",
      name: "東京23区",
      trend: {
        panel: stationsSnapshot.trend.panel.id,
        years: stationsSnapshot.trend.years,
        gaps: stationsSnapshot.trend.gaps.map(({ year, text }) => ({ year, text })),
        views: stationsSnapshot.trend.views,
      },
      // Follow-up 3: the operators' own figures' notice and credit (backend/services/transport.py total()).
      operatorFigures: {
        publisher: stationsSnapshot.operatorFigures.publisher,
        years: stationsSnapshot.operatorFigures.years,
        stationLines: stationsSnapshot.operatorFigures.stationLines,
        below: stationsSnapshot.operatorFigures.below,
        notice: stationsSnapshot.operatorFigures.notice,
        credit: stationsSnapshot.credit.toei_edited,
      },
    },
  },
  "/api/v1/disaster-risks": { status: "ok", data: disaster.wards.map(disasterRecord), sources: disaster.sources, total: disasterRecord(disaster.total) },
  "/api/v1/green-land-use": { status: "ok", data: green.wards.map(disasterRecord), sources: green.sources, total: disasterRecord(green.total) },
  "/api/v1/population-trends": { status: "ok", data: trendRows, sources: trends.sources },
  "/api/v1/auth/me": { status: "active", email_verified: true, role: "user" },
};

export async function signedInDashboard(context: BrowserContext, { email = DEFAULT_EMAIL }: { email?: string } = {}) {
  await context.addInitScript(([key, apiKey, address]) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        uid: "e2e-credits",
        email: address,
        emailVerified: true,
        isAnonymous: false,
        providerData: [],
        stsTokenManager: { refreshToken: "e2e", accessToken: "e2e", expirationTime: Date.now() + 3600 * 1000 },
        createdAt: "1700000000000",
        lastLoginAt: "1700000000000",
        apiKey,
        appName: "[DEFAULT]",
      })
    );
  }, [USER_KEY, API_KEY, email]);
  await context.route(/identitytoolkit\.googleapis\.com\/v1\/accounts:lookup/, (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({
          status: 200,
          headers: CORS,
          body: JSON.stringify({
            users: [{ localId: "e2e-credits", email, emailVerified: true, providerUserInfo: [] }],
          }),
        })
  );
  await context.route(/\/api\/v1\//, (route) => {
    const body = API[new URL(route.request().url()).pathname];
    return route.fulfill({ status: body ? 200 : 404, contentType: "application/json", body: JSON.stringify(body ?? {}) });
  });
  if (SERVES_EXPORT) {
    // python's http.server has no clean URLs; FastAPI serves /app from app.html.
    await context.route(
      (url) => url.pathname === "/app",
      (route) => route.fulfill({ path: path.join(REPO, "out", "app.html"), contentType: "text/html" })
    );
  }
}
