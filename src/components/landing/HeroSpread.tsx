import hero from "@/data/hero-spread.json";
import type { Lang } from "@/i18n/lang";
import { LP_COPY, wardName } from "@/i18n/lp";
import { formatShare } from "@/lib/zoning";

/**
 * The hero spread (design-spec-v1 §4): upside × downside symmetry, measured
 * (real-data plan PR 7, Architect decision 11, 2026-11-05).
 *
 *   rows      the six wards with the highest 2026年地価公示 住宅地 平均変動率
 *             (継続地点 — points comparable with the previous year), from the
 *             PR 5 snapshot;
 *   upside    that 変動率;
 *   downside  two figures, each labelled — 地震: the K2 figure, the ward's
 *             町丁目 at 総合危険度 rank 5 of all its 町丁目 (東京都 地域危険度
 *             第9回, a relative evaluation); 洪水: the share of the ward's area
 *             with 浸水深 3 m 以上 (国土数値情報 A31a-25, 想定最大規模).
 *
 * The rows come from src/data/hero-spread.json, which `etl/disaster.py hero`
 * builds from backend/data/land_prices.json and backend/data/disaster_risks.json
 * (a drift guard re-runs it). The LP is public, so the file is static, not a
 * gated route. Every figure on the spread is measured.
 *
 * Its words come from the LP dictionary (src/i18n/lp.ts). Rendered on its own
 * it reads in Japanese; the landing page passes `copy` for the visitor's
 * language. Ward names are looked up by ward code, never transliterated.
 */

export type HeroSpreadCopy = {
  up: string;
  ward: string;
  down: string;
  quake: string;
  flood: string;
  floodDeep: string;
  units: string;
  count: (count: number, n: number) => string;
  wardName: (region: string) => string;
};

export function heroSpreadCopy(lang: Lang): HeroSpreadCopy {
  const t = LP_COPY[lang];
  return {
    up: t.spreadUp,
    ward: t.spreadWard,
    down: t.spreadDown,
    quake: t.spreadQuake,
    flood: t.spreadFlood,
    floodDeep: t.spreadFloodDeep,
    units: t.spreadUnits,
    count: (count, n) =>
      lang === "ja" ? `${count}（全${n.toLocaleString("ja-JP")}町丁目中）` : `${count} of ${n.toLocaleString("en-US")} chome`,
    wardName: (region) => wardName(region, lang),
  };
}

const JA_COPY = heroSpreadCopy("ja");

export default function HeroSpread({ copy = JA_COPY }: { copy?: HeroSpreadCopy }) {
  const rows = hero.rows;
  const maxChange = Math.max(...rows.map((r) => Math.abs(r.change)), 1);

  return (
    <div className="rounded-sm border" style={{ borderColor: "var(--surface-border)" }} data-hero-spread>
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 px-4 py-2 text-[10px] tracking-widest uppercase"
        style={{ borderBottom: "1px solid var(--rule)" }}
        data-hero-head
      >
        <span className="text-right" style={{ color: "var(--up-text)" }}>
          {copy.up}
        </span>
        <span className="text-muted-foreground">{copy.ward}</span>
        <span style={{ color: "var(--down-text)" }}>{copy.down}</span>
      </div>

      <ul>
        {rows.map((row) => {
          const upWidth = (Math.abs(row.change) / maxChange) * 100;
          return (
            <li
              key={row.code}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 px-4 py-2"
              style={{ borderBottom: "1px solid var(--rule)" }}
              data-hero-row
              data-code={row.code}
            >
              {/* Upside — grows leftward from the centre spine */}
              <div className="flex min-w-0 items-center justify-end gap-2" data-up>
                <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--up-text)" }}>
                  {row.change > 0 ? "+" : ""}
                  {row.change.toFixed(1)}%
                </span>
                <span className="h-2" style={{ width: `${upWidth}%`, background: "var(--up-text)", opacity: 0.85 }} />
              </div>

              <span className="min-w-14 text-center text-[11px] font-medium">{copy.wardName(row.region)}</span>

              {/* Downside — two measured figures, each labelled */}
              <div className="flex min-w-0 flex-col gap-0.5 text-[11px]">
                <span data-quake className="break-words">
                  <span className="text-muted-foreground">{copy.quake} </span>
                  <span className="font-mono tabular-nums" style={{ color: "var(--down-text)" }}>
                    {copy.count(row.rank5, row.chochomoku)}
                  </span>
                </span>
                <span data-flood className="flex flex-wrap items-center gap-x-2">
                  <span className="text-muted-foreground">
                    {copy.flood} {copy.floodDeep}
                  </span>
                  <span className="h-1.5" style={{ width: `${row.floodDeepShare}%`, maxWidth: "40%", background: "var(--down-text)", opacity: 0.85 }} />
                  <span className="font-mono tabular-nums" style={{ color: "var(--down-text)" }}>
                    {formatShare(row.floodDeepShare)}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="source-note m-3" data-hero-units>
        {copy.units}
      </p>
    </div>
  );
}
