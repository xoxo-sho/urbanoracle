// Ward metadata for enriching GeoJSON with dashboard data
// The actual polygon geometries are loaded from /public/data/tokyo-wards.geojson
// (sourced from dataofjapan/land TopoJSON, converted to GeoJSON)

export interface WardFeatureProperties {
  name: string;
  population: number;
  density: number;
  growthRate: number;
  elderly: number;
  avgLandPrice: number;
  priceChange: number;
  maxRiskLevel: number;
  riskTypes: string;
}

export type WardFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, WardFeatureProperties>;

const WARD_META: Record<string, Omit<WardFeatureProperties, "name">> = {
  "千代田区": { population: 67927, density: 5830, growthRate: 2.1, elderly: 21, avgLandPrice: 5300000, priceChange: 4.2, maxRiskLevel: 0, riskTypes: "" },
  "中央区": { population: 174073, density: 17110, growthRate: 3.5, elderly: 17, avgLandPrice: 4800000, priceChange: 3.8, maxRiskLevel: 0, riskTypes: "" },
  "港区": { population: 260486, density: 12770, growthRate: 1.8, elderly: 21, avgLandPrice: 3850000, priceChange: 3.1, maxRiskLevel: 0, riskTypes: "" },
  "新宿区": { population: 349385, density: 19100, growthRate: 0.5, elderly: 22, avgLandPrice: 4120000, priceChange: 2.5, maxRiskLevel: 0, riskTypes: "" },
  "文京区": { population: 240069, density: 21260, growthRate: 1.3, elderly: 21, avgLandPrice: 1150000, priceChange: 1.8, maxRiskLevel: 0, riskTypes: "" },
  "台東区": { population: 211444, density: 20910, growthRate: 0.9, elderly: 24, avgLandPrice: 1080000, priceChange: 2.1, maxRiskLevel: 4, riskTypes: "earthquake" },
  "墨田区": { population: 275082, density: 19980, growthRate: 0.7, elderly: 24, avgLandPrice: 620000, priceChange: 1.5, maxRiskLevel: 5, riskTypes: "earthquake" },
  "江東区": { population: 524310, density: 13050, growthRate: 2.4, elderly: 20, avgLandPrice: 620000, priceChange: 3.2, maxRiskLevel: 5, riskTypes: "flood" },
  "品川区": { population: 422488, density: 18500, growthRate: 1.1, elderly: 21, avgLandPrice: 980000, priceChange: 1.6, maxRiskLevel: 2, riskTypes: "tsunami" },
  "目黒区": { population: 287750, density: 19540, growthRate: 0.6, elderly: 22, avgLandPrice: 1050000, priceChange: 1.2, maxRiskLevel: 0, riskTypes: "" },
  "大田区": { population: 748081, density: 12300, growthRate: 0.2, elderly: 25, avgLandPrice: 520000, priceChange: 0.5, maxRiskLevel: 0, riskTypes: "" },
  "世田谷区": { population: 939099, density: 16200, growthRate: 0.8, elderly: 23, avgLandPrice: 680000, priceChange: 0.8, maxRiskLevel: 3, riskTypes: "landslide" },
  "渋谷区": { population: 243883, density: 16020, growthRate: 1.2, elderly: 20, avgLandPrice: 2950000, priceChange: 2.8, maxRiskLevel: 0, riskTypes: "" },
  "中野区": { population: 344880, density: 22120, growthRate: 0.4, elderly: 23, avgLandPrice: 680000, priceChange: 0.9, maxRiskLevel: 0, riskTypes: "" },
  "杉並区": { population: 591108, density: 17360, growthRate: 0.3, elderly: 24, avgLandPrice: 580000, priceChange: 0.6, maxRiskLevel: 0, riskTypes: "" },
  "豊島区": { population: 301599, density: 23200, growthRate: 0.3, elderly: 24, avgLandPrice: 1280000, priceChange: 1.5, maxRiskLevel: 0, riskTypes: "" },
  "北区": { population: 355213, density: 17230, growthRate: -0.2, elderly: 27, avgLandPrice: 520000, priceChange: 0.4, maxRiskLevel: 3, riskTypes: "earthquake,landslide" },
  "荒川区": { population: 217475, density: 21400, growthRate: 0.1, elderly: 25, avgLandPrice: 520000, priceChange: 0.5, maxRiskLevel: 4, riskTypes: "earthquake" },
  "板橋区": { population: 584483, density: 18140, growthRate: 0.1, elderly: 24, avgLandPrice: 480000, priceChange: 0.4, maxRiskLevel: 0, riskTypes: "" },
  "練馬区": { population: 752608, density: 15650, growthRate: 0.4, elderly: 24, avgLandPrice: 420000, priceChange: 0.3, maxRiskLevel: 0, riskTypes: "" },
  "足立区": { population: 695043, density: 13060, growthRate: -0.3, elderly: 27, avgLandPrice: 310000, priceChange: 0.3, maxRiskLevel: 4, riskTypes: "flood" },
  "葛飾区": { population: 464526, density: 13360, growthRate: -0.1, elderly: 25, avgLandPrice: 290000, priceChange: 0.2, maxRiskLevel: 4, riskTypes: "flood" },
  "江戸川区": { population: 697932, density: 13990, growthRate: -0.2, elderly: 23, avgLandPrice: 320000, priceChange: 0.1, maxRiskLevel: 3, riskTypes: "flood,tsunami" },
};

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
        .filter((f) => f.properties?.name && WARD_META[f.properties.name])
        .map((f, i) => {
          const name = f.properties!.name as string;
          const meta = WARD_META[name]!;
          return {
            ...f,
            id: i,
            properties: { name, ...meta },
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
  stations: Array<{ name: string; lat: number; lng: number; dailyPassengers: number; ward?: string }>
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature" as const,
      properties: { name: s.name, passengers: s.dailyPassengers, ward: s.ward ?? "" },
      geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
    })),
  };
}
