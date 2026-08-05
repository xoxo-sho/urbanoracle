/**
 * Data provenance (design-spec-v1 §9).
 *
 * One place to name every upstream source, so a panel and the footer can never
 * disagree about where a number came from.
 */

export const SOURCES = {
  reinfolib: {
    label: "不動産情報ライブラリ（国土交通省）",
    href: "https://www.reinfolib.mlit.go.jp/",
  },
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
  odpt: {
    label: "公共交通オープンデータセンター（ODPT）",
    href: "https://www.odpt.org/",
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

/** 概算位置の注記 — Stage 3b で確定した文言（design-spec-v1 §9）。 */
export const APPROX_LOCATION_NOTE =
  "地価表示位置は行政区の概算中心です（実際の取引地点とは異なります）";
