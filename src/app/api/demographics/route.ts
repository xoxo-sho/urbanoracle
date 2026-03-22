import { NextResponse } from "next/server";
import { fetchDemographicsFromEStat } from "@/lib/api/demographics";
import { sampleDemographics } from "@/data/sample";

export async function GET() {
  try {
    const data = await fetchDemographicsFromEStat();
    return NextResponse.json({ data, isLive: true });
  } catch {
    return NextResponse.json({ data: sampleDemographics, isLive: false });
  }
}
