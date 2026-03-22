import type { DisasterRisk } from "@/types";
import { apiFetch, fetchWithFallback } from "./client";
import { sampleDisasterRisks } from "@/data/sample";

interface DisasterRiskGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, string | number>;
  }>;
}

const RISK_TYPE_MAP: Record<string, DisasterRisk["type"]> = {
  flood: "flood",
  earthquake: "earthquake",
  landslide: "landslide",
  tsunami: "tsunami",
  "洪水": "flood",
  "地震": "earthquake",
  "土砂": "landslide",
  "津波": "tsunami",
};

function clampLevel(value: number): DisasterRisk["level"] {
  return Math.max(1, Math.min(5, Math.round(value))) as DisasterRisk["level"];
}

function transformFeature(
  props: Record<string, string | number>,
  index: number
): DisasterRisk {
  const rawType = String(props["type"] ?? props["disaster_type"] ?? "flood");

  return {
    id: String(props["id"] ?? `dr-${index}`),
    type: RISK_TYPE_MAP[rawType] ?? "flood",
    level: clampLevel(Number(props["level"] ?? props["risk_level"] ?? 1)),
    region: String(props["region"] ?? props["area_name"] ?? ""),
    description: String(props["description"] ?? props["risk_desc"] ?? ""),
  };
}

export async function fetchDisasterRisks(): Promise<DisasterRisk[]> {
  const geojson = await apiFetch<DisasterRiskGeoJSON>(
    "/data/disaster-risks.json",
    { revalidate: 86400 * 7 }
  );

  return geojson.features.map((f, i) => transformFeature(f.properties, i));
}

export async function getDisasterRisks() {
  return fetchWithFallback(fetchDisasterRisks, sampleDisasterRisks);
}
