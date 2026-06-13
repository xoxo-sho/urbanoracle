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

export type DisasterShieldPml = {
  pml_pct: number;
  pml_jpy?: number | null;
  replacement_cost_jpy?: number | null;
  damage_rank_probabilities?: Record<string, number>;
  provenance?: {
    return_period_years?: number;
    seismic_intensity?: number;
    structure_type?: string;
    seismic_generation?: string;
    assumptions?: string[];
  };
};

/** F6-07 単一物件 PML を proxy 経由で取得。失敗時は null (score 表示は継続)。 */
export async function fetchDisasterShieldPml(
  lat: number,
  lng: number,
  replacementCostJpy?: number,
  options: { signal?: AbortSignal } = {}
): Promise<DisasterShieldPml | null> {
  const cost =
    replacementCostJpy != null ? `&replacement_cost_jpy=${replacementCostJpy}` : "";
  try {
    const res = await fetch(`${PROXY_BASE}/pml?lat=${lat}&lng=${lng}${cost}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: options.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as DisasterShieldPml;
  } catch {
    return null;
  }
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
