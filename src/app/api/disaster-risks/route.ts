import { NextResponse } from "next/server";
import { sampleDisasterRisks } from "@/data/sample";

export async function GET() {
  // Disaster risk data currently uses sample data
  // TODO: Integrate with ハザードマップポータル or 国土数値情報
  return NextResponse.json({ data: sampleDisasterRisks, isLive: false });
}
