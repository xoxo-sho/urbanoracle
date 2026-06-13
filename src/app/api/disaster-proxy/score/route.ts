import { NextRequest, NextResponse } from "next/server";

/**
 * DisasterShield score の server-side proxy (addon、2026-06-13).
 *
 * 目的: DisasterShield API key をブラウザに露出させない。
 * クライアント (DisasterShieldPanel) は同一オリジンの本 route を叩き、
 * 本 route がサーバ側でのみ参照する DISASTER_API_KEY を X-API-Key header に
 * 載せて DisasterShield backend へ中継する。
 *
 * 環境変数 (いずれもサーバ側のみ、NEXT_PUBLIC_ プレフィックス禁止):
 *   DISASTER_API_BASE  — DisasterShield backend URL
 *                        (default: staging Cloud Run)
 *   DISASTER_API_KEY   — auth_mode=apikey 用の dsk_ キー。未設定なら
 *                        header を付けない (auth_mode=stub の staging で動く)。
 *
 * セキュリティ:
 *   - lat / lng のみを許可パラメータとして転送 (任意 query の素通しを防ぐ)
 *   - 5xx / network エラーは 502 に正規化、内部 URL は body に出さない
 */

const API_BASE =
  process.env.DISASTER_API_BASE ??
  "https://disastershield-staging-backend-tnjzbzaz3a-an.a.run.app";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return NextResponse.json(
      { error: "lat and lng must be valid numbers" },
      { status: 400 }
    );
  }
  // 日本域のラフな bbox バリデーション (任意座標の濫用抑制)
  if (latNum < 20 || latNum > 46 || lngNum < 122 || lngNum > 154) {
    return NextResponse.json(
      { error: "coordinates outside supported area (Japan)" },
      { status: 400 }
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.DISASTER_API_KEY;
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  try {
    const upstream = await fetch(
      `${API_BASE}/api/v1/disaster/score?lat=${latNum}&lng=${lngNum}`,
      { headers, signal: AbortSignal.timeout(90_000) }
    );
    const body = await upstream.text();
    // upstream の status / body を透過 (ただし内部 URL は body に含めない設計)
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
