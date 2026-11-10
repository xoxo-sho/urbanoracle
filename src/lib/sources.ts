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
  // Follow-up 3 (Architect decision B): the 高潮 figures.
  tokyoTakashio: {
    label: "東京都 高潮浸水想定区域図（港湾局・建設局）",
    href: "https://www.kouwan.metro.tokyo.lg.jp/jishin_kouwankyoku_oshirase/takashio/shinsuisoutei",
  },
  // Follow-up 3 (Architect decision A): 東京都交通局's own figures beside S12's.
  toei: {
    label: "東京都交通局 乗降者数情報（公共交通オープンデータセンター）",
    href: "https://ckan.odpt.org/dataset/r_passenger_survey-toei",
  },
  disastershield: {
    label: "DisasterShield（Beta）",
    href: "",
  },
} as const;

export type SourceKey = keyof typeof SOURCES;
