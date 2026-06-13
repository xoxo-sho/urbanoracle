"use client";

/**
 * DisasterShield Beta Panel — UrbanOracle addon (2026-06-11).
 *
 * 既存 DisasterRiskPanel が ward 単位の 5 段階概略リスクを表示するのに対し、
 * 本 panel は disastershield staging backend の `/api/v1/disaster/score` を呼び、
 * 物件単位 (緯度経度) の精密スコア (1-100) + 90% 信頼区間 + 来歴 + 免責を表示。
 *
 * 統合経路:
 *   - lib/disastershield-api.ts: fetch wrapper + 型定義
 *   - NEXT_PUBLIC_DISASTER_API_BASE で backend URL 切替 (staging / prod)
 *   - 認証: auth_mode="stub" 想定 (Beta 期間)、JWT 拡張は H5-04 復活時
 */

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  MapPin,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  fetchDisasterShieldScore,
  fetchDisasterShieldPml,
  getRiskLabel,
  getScoreColorClass,
  type DisasterShieldScore,
  type DisasterShieldPml,
} from "@/lib/disastershield-api";
import type { LandPricePoint } from "@/types";

type State =
  | { status: "idle" }
  | { status: "loading"; lat: number; lng: number; label: string }
  | {
      status: "success";
      score: DisasterShieldScore;
      pml: DisasterShieldPml | null;
      label: string;
    }
  | { status: "error"; message: string };

interface DisasterShieldPanelProps {
  /** UrbanOracle 既存 land price points (各点に lat/lng + 住所). */
  landPrices: LandPricePoint[];
  /** 任意で表示時の selectedWard をフィルタに使用 (省略可). */
  selectedWard?: string | null;
}

function MiniScore({
  label,
  score,
  bg,
}: {
  label: string;
  score: number;
  bg: string;
}) {
  return (
    <div className="rounded-md bg-white/[0.03] border border-white/10 p-3 text-center">
      <div
        className={`inline-block text-[10px] text-white px-2 py-0.5 rounded-full mb-1 ${bg}`}
      >
        {label}
      </div>
      <div className={`text-2xl font-bold leading-none ${getScoreColorClass(score)}`}>
        {score.toFixed(0)}
      </div>
      <div className="text-[10px] text-zinc-500 mt-0.5">/ 100</div>
    </div>
  );
}

export default function DisasterShieldPanel({
  landPrices,
  selectedWard,
}: DisasterShieldPanelProps) {
  const [state, setState] = useState<State>({ status: "idle" });

  const filteredPoints = selectedWard
    ? landPrices.filter((p) => p.address.includes(selectedWard))
    : landPrices;

  const points = filteredPoints.length > 0 ? filteredPoints : landPrices;

  const handleFetch = useCallback(async (point: LandPricePoint) => {
    setState({
      status: "loading",
      lat: point.lat,
      lng: point.lng,
      label: point.address,
    });
    try {
      // score (必須) + PML (任意、null 許容) を並列取得
      const [score, pml] = await Promise.all([
        fetchDisasterShieldScore(point.lat, point.lng),
        fetchDisasterShieldPml(point.lat, point.lng),
      ]);
      setState({ status: "success", score, pml, label: point.address });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-400" />
          <h3 className="text-lg font-semibold text-zinc-100">
            DisasterShield Beta — 物件単位スコア
          </h3>
          <span className="ml-auto inline-block bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            v0.1.0 BETA
          </span>
        </div>
        <p className="text-xs text-zinc-400">
          GNN + Mondrian CP による物件 1 棟ごとの精密スコア。地震・洪水・土砂・総合 (1-100)
          + 90% 信頼区間 + 来歴付き。WARD 単位の概略リスク (上記) と相補的。
        </p>
      </header>

      {/* 地価ポイント選択 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <MapPin className="h-3.5 w-3.5" />
          <span>計算対象を選択 ({points.length} 件)</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {points.slice(0, 6).map((point) => {
            const isActive =
              (state.status === "loading" || state.status === "success") &&
              "label" in state &&
              state.label === point.address;
            return (
              <button
                key={point.id}
                type="button"
                onClick={() => handleFetch(point)}
                disabled={state.status === "loading"}
                className={`text-left rounded-md border p-2.5 text-xs transition ${
                  isActive
                    ? "border-amber-400/60 bg-amber-500/5"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-zinc-100 font-medium leading-tight">
                  {point.address}
                </div>
                <div className="text-[10px] text-zinc-500 font-mono mt-1">
                  {point.lat.toFixed(4)}, {point.lng.toFixed(4)} · {point.landUse}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 結果表示 */}
      {state.status === "idle" && (
        <div className="rounded-md bg-zinc-800/40 border border-dashed border-zinc-700 p-4 text-center text-xs text-zinc-500">
          ⬆ 地価ポイントを選択すると、DisasterShield Beta API から精密スコアを取得します。
        </div>
      )}

      {state.status === "loading" && (
        <div className="rounded-md bg-blue-500/5 border border-blue-500/30 p-4 text-center text-sm text-blue-300 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          GNN + Mondrian CP 推論中... (cold start なら 10-30 秒)
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-md bg-red-500/10 border border-red-500/40 p-4 text-sm text-red-300">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4" />
            <strong>エラー</strong>
          </div>
          <div className="text-xs text-red-200/80">{state.message}</div>
        </div>
      )}

      {state.status === "success" && (
        <div className="space-y-4">
          <div className="text-xs text-zinc-400">
            対象:{" "}
            <span className="text-zinc-100 font-medium">{state.label}</span>
          </div>

          {/* 4 score grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniScore label="地震" bg="bg-red-600" score={state.score.seismic_score} />
            <MiniScore label="洪水" bg="bg-blue-600" score={state.score.flood_score} />
            <MiniScore label="土砂" bg="bg-yellow-600" score={state.score.landslide_score} />
            <MiniScore label="総合" bg="bg-emerald-600" score={state.score.composite_score} />
          </div>

          {/* 総合リスクラベル */}
          <div className="rounded-md bg-zinc-800/40 border border-zinc-700 p-3 flex items-center gap-3">
            <TrendingUp
              className={`h-5 w-5 ${getScoreColorClass(state.score.composite_score)}`}
            />
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                総合リスクレベル
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-xl font-bold ${getScoreColorClass(
                    state.score.composite_score
                  )}`}
                >
                  {getRiskLabel(state.score.composite_score)}
                </span>
                <span className="text-xs text-zinc-500">
                  ({state.score.composite_score.toFixed(1)} / 100)
                </span>
              </div>
            </div>
          </div>

          {/* 90% 信頼区間 */}
          {state.score.expected_loss_pi && (
            <div className="rounded-md bg-indigo-500/5 border border-indigo-500/30 p-3 text-sm">
              <div className="text-[10px] text-indigo-300 uppercase tracking-wider mb-1.5">
                期待損失 90% 信頼区間 (再調達価格比)
              </div>
              <div className="flex items-baseline gap-2 font-mono">
                <span className="text-emerald-400 font-semibold">
                  {state.score.expected_loss_pi.lo.toFixed(2)}%
                </span>
                <span className="text-zinc-500">〜</span>
                <span className="text-red-400 font-semibold">
                  {state.score.expected_loss_pi.hi.toFixed(2)}%
                </span>
                <span className="text-[10px] text-zinc-500 ml-auto">
                  信頼水準{" "}
                  {((state.score.expected_loss_pi.confidence ?? 0.9) * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1.5">
                ⚠️ 統計的指標です。個別事案の結果を保証するものではありません。
              </p>
            </div>
          )}

          {/* F6-07 PML (475 年再現期間) */}
          {state.pml && (
            <div className="rounded-md bg-red-500/5 border border-red-500/30 p-3 text-sm">
              <div className="text-[10px] text-red-300 uppercase tracking-wider mb-1.5">
                PML — 475 年再現期間地震の想定損失率 (再調達価格比)
              </div>
              <div
                className={`text-2xl font-bold leading-none ${getScoreColorClass(
                  state.pml.pml_pct
                )}`}
              >
                {state.pml.pml_pct.toFixed(1)}%
              </div>
              {state.pml.provenance && (
                <div className="text-[10px] text-zinc-500 mt-1.5">
                  震度 {state.pml.provenance.seismic_intensity?.toFixed(1)} · 構造{" "}
                  {state.pml.provenance.structure_type} · 再現期間{" "}
                  {state.pml.provenance.return_period_years} 年
                </div>
              )}
              <p className="text-[10px] text-zinc-500 mt-1">
                ⚠️ JBDPA fragility 想定値。耐震診断の代替ではありません。
              </p>
            </div>
          )}

          {/* 来歴 details */}
          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
              スコア来歴 (provenance)
            </summary>
            <table className="w-full mt-2 text-[11px]">
              <tbody>
                <tr>
                  <td className="text-zinc-500 py-0.5 pr-2">model_version</td>
                  <td className="font-mono text-zinc-300">
                    {state.score.model_version ?? "—"}
                  </td>
                </tr>
                {state.score.provenance?.fragility_version && (
                  <tr>
                    <td className="text-zinc-500 py-0.5 pr-2">fragility_version</td>
                    <td className="font-mono text-zinc-300">
                      {state.score.provenance.fragility_version}
                    </td>
                  </tr>
                )}
                {state.score.provenance?.cp_group_key && (
                  <tr>
                    <td className="text-zinc-500 py-0.5 pr-2">cp_group_key</td>
                    <td className="font-mono text-zinc-300">
                      {state.score.provenance.cp_group_key}
                    </td>
                  </tr>
                )}
                {state.score.cached != null && (
                  <tr>
                    <td className="text-zinc-500 py-0.5 pr-2">cached</td>
                    <td className="font-mono text-zinc-300">
                      {state.score.cached ? "yes" : "no"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </details>

          {/* 出典 */}
          {state.score.attribution && state.score.attribution.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
                出典 (Attribution)
              </summary>
              <ul className="mt-2 space-y-1 text-[11px] text-zinc-400">
                {state.score.attribution.map((a) => (
                  <li key={a.source_id}>
                    {a.label}
                    {a.license && (
                      <span className="text-zinc-600 ml-1">({a.license})</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* 免責 */}
          {state.score.disclaimer && (
            <div className="rounded-md bg-amber-500/5 border border-amber-500/30 p-3 text-xs text-amber-200/90 leading-relaxed">
              <div className="font-semibold text-amber-300 mb-1">
                ⚠️ 免責事項 (利用規約{" "}
                {state.score.disclaimer.license_version ?? "v0.1-beta"})
              </div>
              {state.score.disclaimer.not_substitute_for && (
                <p>
                  本サービスは{" "}
                  <strong>
                    {state.score.disclaimer.not_substitute_for.join(" / ")}
                  </strong>
                  の代替ではありません。
                </p>
              )}
              {state.score.disclaimer.liability_cap && (
                <p className="mt-1">
                  損害賠償上限: {state.score.disclaimer.liability_cap}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
