import { NextResponse } from "next/server";
import { sampleTransportStations } from "@/data/sample";

export async function GET() {
  // Transport data currently uses sample data
  // TODO: Integrate with ODPT API when API key is available
  return NextResponse.json({ data: sampleTransportStations, isLive: false });
}
