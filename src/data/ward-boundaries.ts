import { TOKYO_WARD_NAMES } from "@/lib/wards";

// The ward polygons the map draws, and their centres
// The actual polygon geometries are loaded from /public/data/tokyo-wards.geojson
// (sourced from dataofjapan/land TopoJSON, converted to GeoJSON)

// Every figure on a ward feature is merged by MapView at layer time from a
// payload, never a constant: the 地価公示 snapshot's figure for the chosen use
// (landPrice, landPriceText; PR 5), the 災害 snapshot's share of 町丁目 at 総合危険度
// rank 5 (rank5Share; PR 7) and the 2025 census density and the tooltip's
// census lines (density, populationText, densityText; PR 8).
export interface WardFeatureProperties {
  name: string;
  density?: number;
  populationText?: string;
  densityText?: string;
  landPrice?: number;
  landPriceText?: string;
  rank5Share?: number;
}

export type WardFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, WardFeatureProperties>;

// The 23 wards the polygons are kept for (the file also carries no others the
// dashboard draws). The 人口 fields that stood here — population, density,
// growth and elderly share, typed in with no source or year — left with
// real-data plan PR 8: the 人口 fill and the tooltip read the census payload.
const WARD_NAMES = new Set<string>(TOKYO_WARD_NAMES);

// Ward center coordinates (pre-computed from GeoJSON centroids)
const WARD_CENTERS: Record<string, [number, number]> = {
  "千代田区": [139.7570, 35.6892],
  "中央区": [139.7765, 35.6734],
  "港区": [139.7360, 35.6526],
  "新宿区": [139.7047, 35.7029],
  "文京区": [139.7485, 35.7179],
  "台東区": [139.7810, 35.7164],
  "墨田区": [139.8156, 35.7103],
  "江東区": [139.8153, 35.6679],
  "品川区": [139.7296, 35.6121],
  "目黒区": [139.6870, 35.6302],
  "大田区": [139.7329, 35.5735],
  "世田谷区": [139.6344, 35.6388],
  "渋谷区": [139.6967, 35.6679],
  "中野区": [139.6627, 35.7094],
  "杉並区": [139.6255, 35.6943],
  "豊島区": [139.7154, 35.7312],
  "北区": [139.7332, 35.7619],
  "荒川区": [139.7804, 35.7400],
  "板橋区": [139.6772, 35.7698],
  "練馬区": [139.6157, 35.7494],
  "足立区": [139.7970, 35.7791],
  "葛飾区": [139.8577, 35.7593],
  "江戸川区": [139.8719, 35.6992],
};

/**
 * Load ward GeoJSON from static file and enrich with dashboard data.
 * Returns null if fetch fails (caller should handle).
 */
export async function loadWardGeoJSON(): Promise<WardFeatureCollection | null> {
  try {
    const res = await fetch("/data/tokyo-wards.geojson");
    if (!res.ok) return null;
    const raw: GeoJSON.FeatureCollection = await res.json();

    const enriched: WardFeatureCollection = {
      type: "FeatureCollection",
      features: raw.features
        .filter((f) => f.properties?.name && WARD_NAMES.has(f.properties.name))
        .map((f, i) => {
          const name = f.properties!.name as string;
          return {
            ...f,
            id: i,
            properties: { name },
          } as WardFeatureCollection["features"][number];
        }),
    };

    return enriched;
  } catch {
    return null;
  }
}

export function getWardCenter(wardName: string): [number, number] | null {
  return WARD_CENTERS[wardName] ?? null;
}

export function buildStationGeoJSON(
  stations: Array<{
    name: string;
    lat: number;
    lng: number;
    dailyPassengers: number | null;
    ward?: string;
  }>
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    // Stations with no published ridership are omitted rather than drawn at
    // radius 0: the map sizes its circles by passenger volume, and a station
    // the source counts on another row would otherwise render as the
    // smallest possible dot — visually indistinguishable from a genuinely
    // quiet station.
    features: stations
      .filter((s) => typeof s.dailyPassengers === "number")
      .map((s) => ({
        type: "Feature" as const,
        properties: { name: s.name, passengers: s.dailyPassengers, ward: s.ward ?? "" },
        geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
      })),
  };
}
