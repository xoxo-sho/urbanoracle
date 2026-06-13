/**
 * DisasterShield Beta API クライアント (UrbanOracle addon 経路).
 *
 * 統合方式 (要件定義書 §16 と整合):
 *   - DisasterShield は独立 Cloud Run service として稼働 (standalone mode)
 *   - UrbanOracle 側から `/api/v1/disaster/score?lat=...&lng=...` を直接呼ぶ
 *   - 認証: auth_mode="stub" 前提 (Beta 期間)。将来 H5-04 復帰時に JWT 追加
 *
 * 環境変数:
 *   NEXT_PUBLIC_DISASTER_API_BASE — DisasterShield backend URL
 *   default: staging Cloud Run URL
 */

export type DisasterShieldScore = {
  seismic_score: number;
  flood_score: number;
  landslide_score: number;
  composite_score: number;
  breakdown?: {
    seismic_contribution?: number;
    flood_contribution?: number;
    landslide_contribution?: number;
    notes?: Record<string, unknown>;
  };
  expected_loss_pi?: {
    lo: number;
    hi: number;
    confidence: number;
    median?: number;
  };
  attribution?: Array<{
    source_id: string;
    label: string;
    license?: string;
    version?: string;
  }>;
  model_version?: string;
  hazard_snapshot_id?: string;
  provenance?: {
    gnn_model_version?: string;
    fragility_version?: string;
    cp_alpha?: number;
    cp_group_key?: string;
    cp_fallback_used?: boolean;
  };
  disclaimer?: {
    beta?: boolean;
    purpose?: string;
    not_substitute_for?: string[];
    no_warranty?: string;
    redistribution?: string;
    liability_cap?: string;
    license_version?: string;
  };
  computed_at?: string;
  cached?: boolean;
};

// 2026-06-13: backend を直接叩かず、同一オリジンの server-side proxy
// (/api/disaster-proxy/score) を経由する。DisasterShield API key は proxy が
// サーバ側でのみ保持し、ブラウザには露出しない (NEXT_PUBLIC_ を使わない)。
const PROXY_BASE = "/api/disaster-proxy";

export async function fetchDisasterShieldScore(
  lat: number,
  lng: number,
  options: { signal?: AbortSignal } = {}
): Promise<DisasterShieldScore> {
  const url = `${PROXY_BASE}/score?lat=${lat}&lng=${lng}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `DisasterShield API ${res.status} ${res.statusText}: ${body.slice(0, 200)}`
    );
  }
  return (await res.json()) as DisasterShieldScore;
}

export function getRiskLabel(score: number): "低" | "中" | "高" | "最高" {
  if (score < 25) return "低";
  if (score < 50) return "中";
  if (score < 75) return "高";
  return "最高";
}

export function getScoreColorClass(score: number): string {
  if (score < 25) return "text-emerald-400";
  if (score < 50) return "text-yellow-400";
  if (score < 75) return "text-orange-400";
  return "text-red-400";
}
