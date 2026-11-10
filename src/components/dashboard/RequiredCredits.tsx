import {
  A55_NOTICES,
  A55_NOTICES_LABEL,
  ESTAT_API_CREDIT,
  ESTAT_EDITED,
  KSJ_A55_EDITED,
  KSJ_L01_EDITED,
  KSJ_N03_EDITED,
  KSJ_S12_EDITED,
  KSJ_SOURCE,
  RIDERSHIP_SOURCE_NOTICE,
  RIDERSHIP_SOURCE_NOTICE_AT,
  RIDERSHIP_SOURCE_NOTICE_FROM,
  TAKASHIO_EDITED,
  TOEI_EDITED,
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

/**
 * S12's own notice on what the operators' figures are, verbatim, with where
 * it is (real-data plan PR 4b, Architect decision 2026-11-09): on every
 * transport surface that shows a figure — 日間乗降客, 駅一覧, 事業者別,
 * 乗降客数推移 — and in the footer, there with the page's address. For
 * 日間乗降客 it stands once as a full-width line under the three tiles, led
 * by the mark the tile points with (`lead`). `inline` for a spot that may
 * only hold phrasing content (a list item of the footer).
 */
export function S12Notice({
  inline = false,
  withAddress = false,
  lead,
  className,
}: {
  inline?: boolean;
  withAddress?: boolean;
  /** Text set before the sentence, outside the quotation (e.g. the mark a tile refers to). */
  lead?: string;
  className?: string;
}) {
  const from = withAddress ? RIDERSHIP_SOURCE_NOTICE_AT : RIDERSHIP_SOURCE_NOTICE_FROM;
  if (inline) {
    return (
      <span className={className ?? "block"} data-notice="s12">
        {lead}
        {RIDERSHIP_SOURCE_NOTICE}
        <span className="block">— {from}</span>
      </span>
    );
  }
  return (
    <p className={className ?? "source-note mt-1"} data-notice="s12">
      {lead}
      {RIDERSHIP_SOURCE_NOTICE}
      <span className="block">— {from}</span>
    </p>
  );
}

/**
 * What the transport notice gains with 東京都交通局's own figures (follow-up 3,
 * Architect decision A, 2026-11-09), as the payload states it — facts only:
 * the sums use 国土数値情報's values; 都営 rows also show 交通局's figure, which
 * counts transfers between 都営 lines on both lines; at how many rows S12's
 * value is below it. Stands wherever S12's own notice stands, right after it.
 * Nothing is rendered for a payload that carries no such sentences.
 */
export function OperatorFiguresNotice({
  sentences,
  inline = false,
  className,
}: {
  sentences: readonly string[] | null | undefined;
  inline?: boolean;
  className?: string;
}) {
  if (!sentences || sentences.length === 0) return null;
  const body = sentences.map((sentence) => (
    <span key={sentence} className="block">
      {sentence}
    </span>
  ));
  if (inline) {
    return (
      <span className={className ?? "block"} data-notice="toei">
        {body}
      </span>
    );
  }
  return (
    <p className={className ?? "source-note mt-1"} data-notice="toei">
      {body}
    </p>
  );
}

/**
 * 東京都交通局 乗降者数情報 (公共交通オープンデータセンター, CC BY 4.0): the credit
 * in the センター's prescribed form with the modified-use sentence, beside the
 * 駅一覧 that shows the figures.
 */
export function ToeiCredits() {
  return (
    <div className="credit-block" data-credit="toei">
      <p>{TOEI_EDITED}</p>
    </div>
  );
}

/**
 * 東京都「高潮浸水想定区域図」（令和6年12月改定）: the 都's CC BY credit in its
 * modified-use form (東京都オープンデータ利用規約 2(1)イ), on the 高潮 surface.
 */
export function TakashioCredits() {
  return (
    <div className="credit-block" data-credit="takashio">
      <p>{TAKASHIO_EDITED}</p>
    </div>
  );
}

/**
 * 国土数値情報: the 出典 line and the 加工 statement for the 地価公示 snapshot
 * (地価公示データ L01, real-data plan PR 5), in the form with no editor name.
 */
export function KsjLandPriceCredits() {
  return (
    <div className="credit-block" data-credit="ksj-l01">
      <p>{KSJ_SOURCE}</p>
      <p>{KSJ_L01_EDITED}</p>
    </div>
  );
}

/**
 * 国土数値情報: the 出典 line and the 加工 statements for the 用途地域 snapshot
 * (都市計画決定情報データ A55 clipped to 行政区域データ N03, real-data plan PR 6),
 * in the form with no editor name.
 */
export function KsjZoningCredits() {
  return (
    <div className="credit-block" data-credit="ksj-a55">
      <p>{KSJ_SOURCE}</p>
      <p>{KSJ_A55_EDITED}</p>
      <p>{KSJ_N03_EDITED}</p>
    </div>
  );
}

/** The A55 page's six 注意事項, verbatim, wherever the 用途地域 figures are shown. */
export function A55Notices({ className }: { className?: string }) {
  return (
    <div className={className ?? "credit-block"} data-notices="a55">
      <p className="font-medium">{A55_NOTICES_LABEL}</p>
      <ul className="list-disc pl-4 space-y-0.5">
        {A55_NOTICES.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
    </div>
  );
}
