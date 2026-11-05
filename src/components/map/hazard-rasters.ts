import { HAZARD_PORTAL_SOURCE } from "@/lib/credits";

/**
 * The hazard rasters the 災害 layer draws over the map (real-data plan PR 7,
 * Architect sub-decisions 2026-11-05), from the ハザードマップポータルサイト's
 * open data tiles (https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html):
 *
 *   洪水     洪水浸水想定区域（想定最大規模）, the national + prefectural set;
 *   急傾斜地  土砂災害警戒区域（急傾斜地の崩壊）. Every A33-25 zone in the 23
 *            wards is 急傾斜地の崩壊: the 土石流 set the map drew before
 *            (05_dosekiryukeikaikuiki) has no zone there, so it rendered
 *            nothing and is dropped; so is 地すべり, for the same reason.
 *
 * 津波 is not drawn: 東京都's 津波浸水想定 covers the 島しょ部 only, and the
 * tiles that answered at the edges of the map were 千葉県's and 神奈川県's.
 *
 * Every raster carries the portal's prescribed 出典 line (利用規約 1)1).
 * A tile the portal does not publish answers 404; MapLibre 5.21 treats a 404
 * as an empty tile and raises no error event (source_cache _loadTile), so the
 * only trace is the browser's own network log, which page code cannot silence.
 */
export interface HazardRaster {
  id: string;
  name: string;
  tiles: string;
  attribution: string;
  opacity: number;
}

export const HAZARD_RASTERS: readonly HazardRaster[] = [
  {
    id: "hazard-flood",
    name: "洪水浸水想定区域（想定最大規模）",
    tiles: "https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png",
    attribution: HAZARD_PORTAL_SOURCE,
    opacity: 0.5,
  },
  {
    id: "hazard-steep-slope",
    name: "土砂災害警戒区域（急傾斜地の崩壊）",
    tiles: "https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png",
    attribution: HAZARD_PORTAL_SOURCE,
    opacity: 0.55,
  },
] as const;

/** 「洪水浸水想定区域（想定最大規模）・土砂災害警戒区域（急傾斜地の崩壊）」 — what the overlay shows, for the legend and footer. */
export const HAZARD_RASTER_NAMES = HAZARD_RASTERS.map((r) => r.name).join("・");
