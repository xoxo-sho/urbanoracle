import {
  ESTAT_API_CREDIT,
  ESTAT_EDITED,
  KSJ_N03_EDITED,
  KSJ_S12_EDITED,
  KSJ_SOURCE,
} from "@/lib/credits";

/**
 * Notices a provider prescribes, shown next to the figures they cover
 * (RECON 2026-10-data-terms §7.1). Always expanded: a credit behind a hover or
 * a collapsed panel is not a credit.
 */

/** e-Stat: the 加工 statement and the API credit, once per census view. */
export function EstatCredits() {
  return (
    <div className="credit-block" data-credit="estat">
      <p>{ESTAT_EDITED}</p>
      <p>{ESTAT_API_CREDIT}</p>
    </div>
  );
}

/**
 * 国土数値情報: the 出典 line (利用規約 1)ア) and the 加工 statements (1)イ) for the
 * station snapshot — 駅別乗降客数データ S12 and 行政区域データ N03 — in the form
 * with no editor name (Architect decision 12, real-data plan PR 4).
 */
export function KsjCredits() {
  return (
    <div className="credit-block" data-credit="ksj">
      <p>{KSJ_SOURCE}</p>
      <p>{KSJ_S12_EDITED}</p>
      <p>{KSJ_N03_EDITED}</p>
    </div>
  );
}
