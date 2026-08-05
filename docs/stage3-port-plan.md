# Stage 3 Port Plan — 4 Next API routes → FastAPI protected routers

Findings are from code inspection only. No REINFOLIB/e-Stat call was made;
no cloud or DB resource was touched. Decisions marked **DECISION NEEDED**
are Sho's call — the evidence and a recommendation are recorded here.

## 1. Coordinate granularity — the jitter question

**Finding: REINFOLIB XIT001 returns NO coordinates at all. Every plotted
point is a ward centroid from a local table, displaced by a random offset.**

Evidence (`src/lib/api/land-price.ts`):

| What | Where |
|---|---|
| Response interface declares 14 fields — none is a coordinate | lines 5–24 (`PriceCategory, Type, MunicipalityCode, Prefecture, Municipality, DistrictName, TradePrice, Area, UnitPrice, Use, CityPlanning, CoverageRatio, FloorAreaRatio, Period`) |
| Every field actually read from a record | lines 68, 75, 76, 80, 81, 96 — `Municipality`, `TradePrice`, `DistrictName`, `Area`, `CityPlanning`, `Use`. No lat/lng is read because none exists |
| Coordinate source is a hardcoded ward-centroid table | `WARD_COORDS`, lines 39–48; selected at line 67 with a Tokyo-station fallback |
| Random displacement | line 87 `const jitter = () => (Math.random() - 0.5) * 0.015;` applied at lines 91–92 |
| Points per ward that share that one centroid | up to 5 (line 99 `if (points.length >= 5) break;`) |

Magnitude: ±0.0075° ≈ **±830 m** latitude, **±680 m** longitude — ward-scale
scatter, not point-level noise.

So the jitter is **case (i): visual spread over a coarse centroid.** It is
not obfuscation — there is no precise coordinate to obfuscate. Without it,
all five points per ward would stack on one pixel.

**Recommendation: keep the spread, make it DETERMINISTIC.** Seed from a
stable key (`wardCode` + `DistrictName`, e.g. a SHA-256 truncation mapped
into ±0.0075°) so the same district always lands on the same spot. Today the
map moves on every refresh, which also makes the response uncacheable and
untestable. Deterministic seeding costs nothing and removes all three
problems.

Two related observations, not blockers:

- **Honest-label gap (worth a UI note):** the popup address is precise to the
  district (`東京都{ward}{district}`, line 95) while the pin is a randomized
  ward centroid. A reader reasonably assumes the pin means the address. A
  short "approximate location (ward centroid)" disclosure in the map legend
  would close the gap. **DECISION NEEDED.**
- **Better long-term fix (out of Stage 3 scope):** `DistrictName` is present
  in every record, so a district-centroid lookup table would give genuinely
  meaningful positions and make jitter unnecessary. Needs a geocoding source;
  logged as a future option, not part of this port.

## 2. Numeric boundary hazards (inf/nan) — port-time guards

Porting to Python **raises the severity** of these: JS `JSON.stringify`
turns `NaN` into `null` (silent bad datum), whereas Python's `json.dumps`
emits a bare `NaN` literal, which is **invalid JSON** — `JSON.parse` in the
browser throws and the whole panel fails, not just one point. Both sites
must be guarded with `math.isfinite` at the boundary.

**Site A — land-prices (confirmed).** `src/lib/api/land-price.ts:80–84`:
`parseInt(item.TradePrice, 10)` on a non-numeric value yields `NaN`;
`Math.round(NaN / area)` is `NaN`; the guard `if (pricePerSqm <= 0) continue`
is **false** for `NaN`, so it passes through. Verified in node:
`pricePerSqm -> NaN`, guard catches it `-> false`, `JSON.stringify -> {"price":null}`.
The only pre-filter is an empty-string check at line 75, which does not
exclude values like `"非公表"`.
Other numeric fields on this path: `area` is safe (`parseInt(...) || 1`
turns both `NaN` and `0` into 1, so no divide-by-zero), `year` is a constant.
Separate silent-truncation note: `parseInt("1,000,000", 10) === 1` — a
comma-formatted price becomes 1 yen and is then dropped by the `<= 0` guard,
so it fails safe, but a `str.replace(",", "")` normalization is cheap.

**Site B — demographics (CORRECTION to the earlier recon, which called these
"all guarded").** `src/lib/api/demographics.ts:66` returns `parseFloat(v.$)`.
e-Stat encodes suppressed/unavailable cells as `"-"`, `"***"`, `"X"` — all
of which `parseFloat` turns into `NaN`. The guard at line 92 is
`if (totalPop === 0) continue`, and `NaN === 0` is **false**, so a suppressed
total flows into `population: NaN` and `density: Math.round(NaN / area)` →
`NaN` (verified in node). The area divisor is a positive constant, so
division itself is safe; the hazard is the numerator.
Guard to add: treat non-finite `findValue` results as missing (skip the
ward), not as zero.

**Quality note (not inf/nan):** `workingPct = 100 - youngPct - elderlyPct`
(line 110) can go negative if the API's own percentages disagree with the
counts. Clamp to `[0, 100]` when porting.

## 3. Per-route port items

| Route | External dep | Port change |
|---|---|---|
| `/api/land-prices` | REINFOLIB XIT001, key `REINFOLIB_API_KEY` (header `Ocp-Apim-Subscription-Key`) | 8 wards fetched concurrently (`Promise.allSettled` → `asyncio.gather(return_exceptions=True)`); add `math.isfinite` guard; deterministic jitter |
| `/api/demographics` | e-Stat getStatsData, key `ESTAT_API_KEY` (query param) | add non-finite guard; clamp `workingPct` |
| `/api/disaster-risks` | **none** — returns sample data only | Trivial port. It currently reports `isLive: true` while serving static sample data (`src/app/api/disaster-risks/route.ts:10`) — **misleading; recommend `isLive: false`.** GSI hazard rasters stay client-side in MapLibre and are unaffected. **DECISION NEEDED** (a UI "live" badge may key off this) |
| `/api/transport` | self-HTTP fetch of its own static file | **Becomes a local file read.** Confirmed: `public/data/tokyo-stations.geojson`, 133,475 B, `FeatureCollection`, **558 features**, properties `name/lines/lineCount/operators`, geometry `Point`. Drops the `VERCEL_URL || localhost` origin logic (`route.ts:52–58`) entirely |

Transport transform purity — **confirmed portable as-is**: `WARD_BOUNDS`
(lines 6–30) and `assignWard` (32–39) are pure bbox lookups; the sort/slice
to top-50 by `lineCount` and the operator-name rewrite
(`東日本旅客鉄道→JR`, `東京地下鉄→メトロ`, `東京都→都営`, lines 77–81) are pure
string/array ops. No I/O, no clock, no randomness.

## 4. Dead code — delete list for 3b

Confirmed by import graph: only two modules in `src/lib/api/` have any
external importer, and both importers are Next route handlers that Stage 3b
deletes.

- `src/lib/api/transport.ts` — 0 importers; fetches `/data/transport-stations.geojson`, **a file that does not exist**
- `src/lib/api/disaster-risk.ts` — 0 importers; fetches `/data/disaster-risks.json`, **also nonexistent**
- `src/lib/api/index.ts` — 0 importers (barrel re-exporting only dead `getX` wrappers)
- `src/lib/api/client.ts` — 0 external importers; used only by the files above and by dead `getX` wrappers
- `src/lib/api/land-price.ts`, `src/lib/api/demographics.ts` — logic moves to Python; delete **after** the routers land
- `src/app/api/**` (all 4 route handlers, plus the 2 disaster-proxy routes at Stage 4.5)

Net: the whole `src/lib/api/` directory and `src/app/api/` tree are removed
once the FastAPI routers are verified.

## 5. API path decision

**Recommendation: (b) remap to `/api/v1/*`**, matching the Parallel City
convention.

Churn is small and mechanical — 4 endpoint strings (`src/app/page.tsx:96–99`)
and one base constant (`src/lib/disastershield-api.ts:62`). In exchange it
aligns with the deploy-time verification shape already proven in Parallel
City (`GET /api/v1/health` public → 200; every protected route → 401) and
with `spa.py`'s reserved-prefix handling, so a typo'd API path stays a JSON
404 instead of silently returning the SPA shell. Doing it now, while the
client is being touched anyway, is cheaper than versioning later.

## 6. Other Stage 3b work items

- **Security headers**: `next.config.ts` `headers()` does not survive static
  export. Re-emit all four from FastAPI middleware: `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **Auth**: all four routers mount behind `require_active` (Stage 2b);
  `/api/v1/health` stays public.
- **Caching**: the `next: { revalidate: 86400 * 30 }` hints (4 sites) have no
  Python equivalent by default — re-decide server-side (in-process TTL cache
  or `Cache-Control` response headers).
- **Secrets**: `ESTAT_API_KEY` / `REINFOLIB_API_KEY` move from Vercel env to
  Secret Manager references at deploy time (locations only; values never in
  the repo). Note `ODPT_API_KEY` is declared in `.env.example`/`.env.local`
  but referenced nowhere — drop it unless a use is planned.
