import {
  sampleDisasterRisks,
  sampleLandPriceSummary,
  sampleWardProfiles,
} from "@/data/sample";
import SampleNote from "@/components/dashboard/SampleNote";
import type { Lang } from "@/i18n/lang";
import { LP_COPY, wardName } from "@/i18n/lp";

/**
 * The hero spread (design-spec-v1 §4): upside × downside symmetry.
 *
 * Both columns come from the bundled sample set in src/data/sample.ts. They
 * are per-ward and internally consistent, but they are NOT measured figures
 * and no upstream can be cited for them:
 *
 *   upside   = changeRate from the sample land-price summary (signed %)
 *   downside = the highest hazard level in the sample risk list for that
 *              ward, and its safety score from the sample ward profile
 *
 * The composition is the argument — rows ordered by upside, the same wards on
 * both sides, so the ward with the strongest price movement is visibly not
 * the safest one. The spread therefore says SAMPLE on its face and in its
 * caption; real-data wiring is a later stage and does not change the layout.
 *
 * Its words come from the LP dictionary (src/i18n/lp.ts). Rendered on its own
 * it reads in Japanese; the landing page passes `copy` for the visitor's
 * language. Ward names are looked up by ward code, never transliterated.
 */

export type HeroSpreadCopy = {
  up: string;
  sampleTag: string;
  ward: string;
  down: string;
  level: string;
  safety: string;
  none: string;
  units: string;
  sampleNotice: string;
  wardName: (region: string) => string;
};

export function heroSpreadCopy(lang: Lang): HeroSpreadCopy {
  const t = LP_COPY[lang];
  return {
    up: t.spreadUp,
    sampleTag: t.sampleTag,
    ward: t.spreadWard,
    down: t.spreadDown,
    level: t.spreadLevel,
    safety: t.spreadSafety,
    none: t.none,
    units: t.spreadUnits,
    sampleNotice: t.sampleNotice,
    wardName: (region) => wardName(region, lang),
  };
}

const JA_COPY = heroSpreadCopy("ja");

const ROWS = 6;

function maxHazardLevel(region: string): number | null {
  const levels = sampleDisasterRisks
    .filter((risk) => risk.region === region)
    .map((risk) => risk.level);
  return levels.length ? Math.max(...levels) : null;
}

export default function HeroSpread({ copy = JA_COPY }: { copy?: HeroSpreadCopy }) {
  const rows = [...sampleLandPriceSummary]
    .sort((a, b) => b.changeRate - a.changeRate)
    .slice(0, ROWS)
    .map((summary) => {
      const profile = sampleWardProfiles.find((p) => p.region === summary.region);
      return {
        region: summary.region,
        changeRate: summary.changeRate,
        avgPrice: summary.avgPrice,
        hazard: maxHazardLevel(summary.region),
        safety: profile?.safety ?? null,
      };
    });

  const maxChange = Math.max(...rows.map((r) => Math.abs(r.changeRate)), 1);

  return (
    <div className="rounded-sm border" style={{ borderColor: "var(--surface-border)" }}>
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 px-4 py-2 text-[10px] tracking-widest uppercase"
        style={{ borderBottom: "1px solid var(--rule)" }}
      >
        <span className="text-right" style={{ color: "var(--up-text)" }}>
          {copy.up}
        </span>
        <span className="flex flex-col items-center gap-0.5 text-muted-foreground">
          <span className="sample-tag">{copy.sampleTag}</span>
          {copy.ward}
        </span>
        <span style={{ color: "var(--down-text)" }}>{copy.down}</span>
      </div>

      <ul>
        {rows.map((row) => {
          const upWidth = (Math.abs(row.changeRate) / maxChange) * 100;
          const downWidth = row.hazard ? (row.hazard / 5) * 100 : 0;
          return (
            <li
              key={row.region}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 px-4 py-2"
              style={{ borderBottom: "1px solid var(--rule)" }}
            >
              {/* Upside — grows leftward from the centre spine */}
              <div className="flex items-center justify-end gap-2">
                <span
                  className="font-mono text-[11px] tabular-nums"
                  style={{ color: "var(--up-text)" }}
                >
                  {row.changeRate > 0 ? "+" : ""}
                  {row.changeRate.toFixed(1)}%
                </span>
                <span
                  className="h-2"
                  style={{ width: `${upWidth}%`, background: "var(--up-text)", opacity: 0.85 }}
                />
              </div>

              <span className="min-w-14 text-center text-[11px] font-medium">
                {copy.wardName(row.region)}
              </span>

              {/* Downside — grows rightward from the same spine */}
              <div className="flex items-center gap-2">
                <span
                  className="h-2"
                  style={{ width: `${downWidth}%`, background: "var(--down-text)", opacity: 0.85 }}
                />
                <span
                  className="font-mono text-[11px] tabular-nums"
                  style={{ color: "var(--down-text)" }}
                >
                  {row.hazard ? `${copy.level}${row.hazard}` : copy.none}
                </span>
                {row.safety !== null && (
                  <span className="text-[10px] text-muted-foreground">
                    {`${copy.safety} `}
                    {row.safety}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <SampleNote className="m-3" note={copy.units} notice={copy.sampleNotice} />
    </div>
  );
}
