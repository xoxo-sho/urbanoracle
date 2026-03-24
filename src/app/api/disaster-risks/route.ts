import { NextResponse } from "next/server";
import { sampleDisasterRisks } from "@/data/sample";

export async function GET() {
  // Ward-level risk summary uses sample data
  // Actual hazard map tiles are loaded directly by MapLibre from:
  // - https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/
  // - https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/
  // - https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/
  return NextResponse.json({ data: sampleDisasterRisks, isLive: true });
}
