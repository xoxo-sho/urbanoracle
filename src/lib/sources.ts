/**
 * Data provenance (design-spec-v1 §9).
 *
 * One place to name every upstream source, so a panel and the footer can never
 * disagree about where a number came from.
 */

export const SOURCES = {
  estat: {
    label: "e-Stat 国勢調査（総務省統計局）",
    href: "https://www.e-stat.go.jp/",
  },
  ksj: {
    label: "国土数値情報（国土交通省）",
    href: "https://nlftp.mlit.go.jp/ksj/",
  },
  hazard: {
    label: "ハザードマップポータルサイト（国土交通省）",
    href: "https://disaportal.gsi.go.jp/",
  },
  disastershield: {
    label: "DisasterShield（Beta）",
    href: "",
  },
  sample: {
    label: "サンプルデータ（暫定）",
    href: "",
  },
} as const;

export type SourceKey = keyof typeof SOURCES;

/**
 * The visible warning on every surface fed from src/data/sample.ts, or from
 * the hook's fallback to it. A warning, not a citation: a sample number
 * attributed to a ministry is a false claim, and this line is what replaces
 * that claim.
 */
export const SAMPLE_NOTICE = `${SOURCES.sample.label}— 実データではありません`;

/**
 * The map's 人口 and 災害 ward fills are coloured from WARD_META
 * (ward-boundaries.ts), a hardcoded table that is neither the live feed nor
 * the sample set. The 地価 fill left that table in real-data plan PR 5: it is
 * the 地価公示 snapshot's, and its legend cites it.
 */
export const CHOROPLETH_NOTE = "固定の参考値 — 実データではありません";
