import { NextResponse } from "next/server";
import { fetchLandPrices } from "@/lib/api/land-price";
import { sampleLandPrices } from "@/data/sample";

export async function GET() {
  try {
    const data = await fetchLandPrices();
    return NextResponse.json({ data, isLive: true });
  } catch {
    return NextResponse.json({ data: sampleLandPrices, isLive: false });
  }
}
