import { NextRequest, NextResponse } from "next/server";

/**
 * DisasterShield F6-07 PML の server-side proxy (addon、2026-06-13).
 *
 * /api/disaster-proxy/score と同じく API key をブラウザ非露出にする。
 * lat / lng / replacement_cost_jpy のみ転送。詳細は score/route.ts 参照。
 */

const API_BASE =
  process.env.DISASTER_API_BASE ??
  "https://disastershield-staging-backend-tnjzbzaz3a-an.a.run.app";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latNum = Number(searchParams.get("lat"));
  const lngNum = Number(searchParams.get("lng"));
  const costRaw = searchParams.get("replacement_cost_jpy");

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return NextResponse.json(
      { error: "lat and lng must be valid numbers" },
      { status: 400 }
    );
  }
  if (latNum < 20 || latNum > 46 || lngNum < 122 || lngNum > 154) {
    return NextResponse.json(
      { error: "coordinates outside supported area (Japan)" },
      { status: 400 }
    );
  }

  let costQuery = "";
  if (costRaw != null) {
    const costNum = Number(costRaw);
    if (Number.isFinite(costNum) && costNum >= 0) {
      costQuery = `&replacement_cost_jpy=${costNum}`;
    }
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.DISASTER_API_KEY;
  if (apiKey) headers["X-API-Key"] = apiKey;

  try {
    const upstream = await fetch(
      `${API_BASE}/api/v1/disaster/property/pml?lat=${latNum}&lng=${lngNum}${costQuery}`,
      { headers, signal: AbortSignal.timeout(90_000) }
    );
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream unreachable";
    return NextResponse.json(
      { error: "disaster_upstream_error", detail: message },
      { status: 502 }
    );
  }
}
