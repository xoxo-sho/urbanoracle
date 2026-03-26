import { NextResponse } from "next/server";
import { sampleTransportStations } from "@/data/sample";
import type { TransportStation } from "@/types";

// Ward assignment by approximate coordinate bounds
const WARD_BOUNDS: Array<{ name: string; latMin: number; latMax: number; lngMin: number; lngMax: number }> = [
  { name: "千代田区", latMin: 35.672, latMax: 35.705, lngMin: 139.730, lngMax: 139.781 },
  { name: "中央区", latMin: 35.650, latMax: 35.688, lngMin: 139.756, lngMax: 139.792 },
  { name: "港区", latMin: 35.630, latMax: 35.678, lngMin: 139.720, lngMax: 139.770 },
  { name: "新宿区", latMin: 35.681, latMax: 35.716, lngMin: 139.683, lngMax: 139.729 },
  { name: "文京区", latMin: 35.700, latMax: 35.728, lngMin: 139.731, lngMax: 139.768 },
  { name: "台東区", latMin: 35.700, latMax: 35.731, lngMin: 139.765, lngMax: 139.796 },
  { name: "墨田区", latMin: 35.692, latMax: 35.735, lngMin: 139.788, lngMax: 139.822 },
  { name: "江東区", latMin: 35.630, latMax: 35.705, lngMin: 139.780, lngMax: 139.852 },
  { name: "品川区", latMin: 35.585, latMax: 35.635, lngMin: 139.705, lngMax: 139.755 },
  { name: "目黒区", latMin: 35.620, latMax: 35.662, lngMin: 139.675, lngMax: 139.715 },
  { name: "大田区", latMin: 35.520, latMax: 35.595, lngMin: 139.670, lngMax: 139.755 },
  { name: "世田谷区", latMin: 35.610, latMax: 35.670, lngMin: 139.598, lngMax: 139.686 },
  { name: "渋谷区", latMin: 35.650, latMax: 35.683, lngMin: 139.682, lngMax: 139.720 },
  { name: "中野区", latMin: 35.695, latMax: 35.723, lngMin: 139.645, lngMax: 139.687 },
  { name: "杉並区", latMin: 35.680, latMax: 35.720, lngMin: 139.598, lngMax: 139.668 },
  { name: "豊島区", latMin: 35.713, latMax: 35.743, lngMin: 139.698, lngMax: 139.738 },
  { name: "北区", latMin: 35.735, latMax: 35.785, lngMin: 139.705, lngMax: 139.765 },
  { name: "荒川区", latMin: 35.722, latMax: 35.753, lngMin: 139.763, lngMax: 139.805 },
  { name: "板橋区", latMin: 35.730, latMax: 35.785, lngMin: 139.640, lngMax: 139.720 },
  { name: "練馬区", latMin: 35.715, latMax: 35.765, lngMin: 139.595, lngMax: 139.695 },
  { name: "足立区", latMin: 35.745, latMax: 35.810, lngMin: 139.755, lngMax: 139.853 },
  { name: "葛飾区", latMin: 35.720, latMax: 35.775, lngMin: 139.820, lngMax: 139.885 },
  { name: "江戸川区", latMin: 35.650, latMax: 35.745, lngMin: 139.835, lngMax: 139.910 },
];

function assignWard(lat: number, lng: number): string | undefined {
  for (const w of WARD_BOUNDS) {
    if (lat >= w.latMin && lat <= w.latMax && lng >= w.lngMin && lng <= w.lngMax) {
      return w.name;
    }
  }
  return undefined;
}

interface StationGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    properties: { name: string; lines: string[]; lineCount: number };
    geometry: { coordinates: [number, number] };
  }>;
}

export async function GET() {
  try {
    // Try loading real station data from GeoJSON
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const res = await fetch(`${baseUrl}/data/tokyo-stations.geojson`, {
      next: { revalidate: 86400 * 30 },
    });

    if (!res.ok) throw new Error("Failed to load station GeoJSON");

    const geojson: StationGeoJSON = await res.json();

    // Convert to TransportStation format, take top 50 by line count
    const stations: TransportStation[] = geojson.features
      .sort((a, b) => b.properties.lineCount - a.properties.lineCount)
      .slice(0, 50)
      .map((f, i) => {
        const [lng, lat] = f.geometry.coordinates;
        return {
          id: `ts-${i}`,
          name: `${f.properties.name}駅`,
          lat,
          lng,
          type: "train" as const,
          dailyPassengers: 0, // GeoJSON doesn't have passenger data
          lines: f.properties.lines.map((l) =>
            l.replace("東日本旅客鉄道", "JR")
              .replace("東京地下鉄", "メトロ")
              .replace("東京都", "都営")
          ),
          ward: assignWard(lat, lng),
        };
      });

    return NextResponse.json({ data: stations, isLive: true });
  } catch {
    return NextResponse.json({ data: sampleTransportStations, isLive: false });
  }
}
