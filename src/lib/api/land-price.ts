import type { LandPricePoint } from "@/types";
import { fetchWithFallback } from "./client";
import { sampleLandPrices } from "@/data/sample";

interface ReinfolibResponse {
  status: string;
  data: Array<{
    PriceCategory: string;
    Type: string;
    MunicipalityCode: string;
    Prefecture: string;
    Municipality: string;
    DistrictName: string;
    TradePrice: string;
    Area: string;
    UnitPrice: string;
    Use: string;
    CityPlanning: string;
    CoverageRatio: string;
    FloorAreaRatio: string;
    Period: string;
    [key: string]: string;
  }>;
}

// Tokyo central ward codes
const TARGET_WARDS = [
  "13101", // 千代田区
  "13102", // 中央区
  "13103", // 港区
  "13104", // 新宿区
  "13113", // 渋谷区
  "13116", // 豊島区
  "13110", // 目黒区
  "13109", // 品川区
];

// Approximate coordinates for Tokyo wards (centroid)
const WARD_COORDS: Record<string, { lat: number; lng: number }> = {
  "13101": { lat: 35.6940, lng: 139.7536 },
  "13102": { lat: 35.6706, lng: 139.7727 },
  "13103": { lat: 35.6581, lng: 139.7514 },
  "13104": { lat: 35.6938, lng: 139.7035 },
  "13113": { lat: 35.6640, lng: 139.6982 },
  "13116": { lat: 35.7263, lng: 139.7161 },
  "13110": { lat: 35.6413, lng: 139.6980 },
  "13109": { lat: 35.6090, lng: 139.7300 },
};

async function fetchWardData(
  wardCode: string,
  apiKey: string
): Promise<LandPricePoint[]> {
  const url = `https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001?area=${wardCode}&year=2024`;

  const res = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
    next: { revalidate: 86400 * 30 },
  });

  if (!res.ok) return [];

  const data: ReinfolibResponse = await res.json();
  if (data.status !== "OK" || !data.data) return [];

  // Filter to land transactions with price info, take representative samples
  const coords = WARD_COORDS[wardCode] ?? { lat: 35.68, lng: 139.76 };
  const ward = data.data[0]?.Municipality ?? "";

  // Get unique district entries with prices
  const seen = new Set<string>();
  const points: LandPricePoint[] = [];

  for (const item of data.data) {
    if (!item.TradePrice || item.TradePrice === "") continue;
    const district = item.DistrictName;
    if (seen.has(district)) continue;
    seen.add(district);

    const price = parseInt(item.TradePrice, 10);
    const area = parseInt(item.Area, 10) || 1;
    const pricePerSqm = Math.round(price / area);

    if (pricePerSqm <= 0) continue;

    // Add slight coordinate jitter per district
    const jitter = () => (Math.random() - 0.5) * 0.015;

    points.push({
      id: `lp-${wardCode}-${points.length}`,
      lat: coords.lat + jitter(),
      lng: coords.lng + jitter(),
      price: pricePerSqm,
      year: 2024,
      address: `東京都${ward}${district}`,
      landUse: item.CityPlanning || item.Use || "その他",
    });

    if (points.length >= 5) break; // Limit per ward
  }

  return points;
}

export async function fetchLandPrices(): Promise<LandPricePoint[]> {
  const apiKey = process.env.REINFOLIB_API_KEY;
  if (!apiKey) throw new Error("REINFOLIB_API_KEY not set");

  const results = await Promise.allSettled(
    TARGET_WARDS.map((code) => fetchWardData(code, apiKey))
  );

  const allPoints: LandPricePoint[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allPoints.push(...result.value);
    }
  }

  if (allPoints.length === 0) throw new Error("No land price data retrieved");
  return allPoints;
}

export async function getLandPrices() {
  return fetchWithFallback(fetchLandPrices, sampleLandPrices);
}
