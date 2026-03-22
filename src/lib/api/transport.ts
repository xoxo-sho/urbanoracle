import type { TransportStation } from "@/types";
import { apiFetch, fetchWithFallback } from "./client";
import { sampleTransportStations } from "@/data/sample";

interface TransportGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, string | number | string[]>;
  }>;
}

function transformFeature(
  feature: TransportGeoJSON["features"][number],
  index: number
): TransportStation {
  const props = feature.properties;
  const [lng, lat] = feature.geometry.coordinates;

  const rawLines = props["lines"];
  const lines: string[] = Array.isArray(rawLines)
    ? rawLines
    : typeof rawLines === "string"
      ? rawLines.split(",").map((s) => s.trim())
      : [];

  return {
    id: String(props["id"] ?? `ts-${index}`),
    name: String(props["name"] ?? props["station_name"] ?? ""),
    lat,
    lng,
    type: (String(props["type"] ?? "train") as TransportStation["type"]),
    dailyPassengers: Number(props["dailyPassengers"] ?? props["passengers"] ?? 0),
    lines,
  };
}

export async function fetchTransportStations(): Promise<TransportStation[]> {
  const geojson = await apiFetch<TransportGeoJSON>(
    "/data/transport-stations.geojson",
    { revalidate: 86400 * 30 }
  );

  return geojson.features
    .map((f, i) => transformFeature(f, i))
    .filter((s) => s.name);
}

export async function getTransportStations() {
  return fetchWithFallback(fetchTransportStations, sampleTransportStations);
}
