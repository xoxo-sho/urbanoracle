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
  // Real-data plan PR 7 (Architect decision 1): the earthquake figures.
  tokyoKikendo: {
    label: "東京都 地震に関する地域危険度測定調査（都市整備局）",
    href: "https://www.toshiseibi.metro.tokyo.lg.jp/",
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

// The 「固定の参考値」 note left with real-data plan PR 8: the last fill on the
// hardcoded ward table, 人口, reads the 2025 census payload; every fill is its snapshot's.
