"use client";

import type { FieldSources, ZoningComposition } from "@/types";
import type { DataStatus } from "@/lib/use-gated-data";
import { SOURCES } from "@/lib/sources";
import { zoningLine } from "@/lib/census-sources";
import { ZONING_ASOF_NOTE, ZONING_DESIGNATED_NOTE, ZONING_FAR_NOTE, ZONING_SHARE_NOTE } from "@/lib/credits";
import { designatedLine, formatKm2, formatShare, rangeText, typeStyle } from "@/lib/zoning";
import { NO_DATA } from "@/lib/format";
import { A55Notices, KsjZoningCredits } from "@/components/dashboard/RequiredCredits";
import { StateNotice, isPending } from "@/components/dashboard/DataState";

/**
 * 用途地域 tab (real-data plan PR 6): the composition of the selected ward — or
 * of the 23 wards when none is selected — from the committed 国土数値情報
 * A55-24 snapshot (/api/v1/zoning): Z1, the share of the designated area by
 * 用途地域 type with the designated share of the ward and the 時点 the data
 * list states; Z2, per type present, the area-weighted 指定容積率 / 指定建蔽率
 * and their range. Types keep A55's codes and names, in code order; only the
 * types present are listed. Every edition and table named here is read from
 * the payload's `sources`; the 時点 sentence is the payload's own.
 */

interface ZoningPanelProps {
  /** The composition in view: the selected ward's record, or the payload's `total`; null while pending. */
  composition: ZoningComposition | null;
  /** State of the /zoning answer. */
  status: DataStatus;
  /** The payload's `sources`: per field, the 国土数値情報 edition and its table. */
  sources?: FieldSources;
  selectedWard: string | null;
}

const FAR_SCALE = 1300; // the highest 指定容積率 in the 23 wards' layers (千代田区 商業地域); the bar is a visual ratio only

export default function ZoningPanel({ composition, status, sources = {}, selectedWard }: ZoningPanelProps) {
  const pending = isPending(status);
  const sourceName = `用途地域: ${SOURCES.ksj.label}`;
  const provenance = zoningLine(sources);
  const region = composition?.region ?? selectedWard ?? "東京23区";

  return (
    <div className="space-y-4" data-surface="zoning">
      {/* Z1: 面積構成 — a stacked bar, not a chart library component */}
      <div className="chart-section" data-surface="zoning-composition">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">用途地域 面積構成</h4>
          <span className="text-[10px] text-muted-foreground" data-region>
            {region}
          </span>
        </div>
        {pending ? (
          <StateNotice status={status} source={sourceName} />
        ) : composition === null ? (
          <p className="state-note">{NO_DATA}</p>
        ) : (
          <>
            <div className="flex h-5 rounded-full overflow-hidden" data-zoning-bar>
              {composition.types.map((t, i) => (
                <div
                  key={t.code}
                  data-zoning-segment
                  data-code={t.code}
                  data-share={t.share}
                  style={{ width: `${t.share}%`, ...typeStyle(i) }}
                  title={`${t.name}: ${formatShare(t.share)}`}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {composition.types.map((t, i) => (
                <div
                  key={t.code}
                  className="flex items-center gap-2"
                  data-zoning-type
                  data-code={t.code}
                  data-name={t.name}
                  data-share={t.share}
                  data-m2={t.m2}
                >
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={typeStyle(i)} />
                  <span className="text-[11px] text-muted-foreground truncate flex-1">{t.name}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{formatKm2(t.m2)}</span>
                  <span className="text-[11px] tabular-nums text-foreground w-12 text-right">{formatShare(t.share)}</span>
                </div>
              ))}
            </div>
            <p
              className="mt-3 text-[11px] text-foreground"
              data-designated
              data-share-of-ward={composition.designatedShare}
              data-designated-m2={composition.designatedM2}
              data-ward-m2={composition.wardM2}
            >
              {designatedLine(composition, selectedWard)}
              <span className="text-muted-foreground">
                （{formatKm2(composition.designatedM2)} ／ 区域 {formatKm2(composition.wardM2)}、{composition.designatedShare.toFixed(1)}%）
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground" data-as-of data-as-of-date={composition.asOf.date ?? ""}>
              {composition.asOf.text}
            </p>
            <p className="source-note mt-2">
              {`出典: ${SOURCES.ksj.label}`}
              {provenance ? ` ／ ${provenance}` : ""}
              <span className="block">{ZONING_SHARE_NOTE}</span>
              <span className="block">{ZONING_DESIGNATED_NOTE}</span>
              <span className="block">{ZONING_ASOF_NOTE}</span>
            </p>
          </>
        )}
      </div>

      {/* Z2: 容積率・建蔽率 — per type present, the area-weighted mean and the range */}
      <div className="chart-section" data-surface="zoning-far">
        <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          容積率・建蔽率（面積加重平均・範囲）
        </h4>
        {pending ? (
          <StateNotice status={status} source={sourceName} />
        ) : composition === null ? (
          <p className="state-note">{NO_DATA}</p>
        ) : (
          <>
            <div className="space-y-2">
              {composition.types.map((t, i) => (
                <div
                  key={t.code}
                  className="flex items-center gap-3"
                  data-zoning-far
                  data-code={t.code}
                  data-far-mean={t.far.mean}
                  data-far-min={t.far.min}
                  data-far-max={t.far.max}
                  data-bcr-mean={t.bcr.mean}
                  data-bcr-min={t.bcr.min}
                  data-bcr-max={t.bcr.max}
                >
                  <span className="w-28 text-[10px] text-muted-foreground truncate" title={t.name}>
                    {t.name}
                  </span>
                  <div className="flex-1 flex items-center gap-2" title={rangeText("容積率", t.far)}>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (t.far.mean / FAR_SCALE) * 100)}%`, ...typeStyle(i) }} />
                    </div>
                    <span className="text-[10px] tabular-nums w-24 text-right">
                      {t.far.mean.toFixed(0)}%<span className="text-muted-foreground"> {t.far.min}〜{t.far.max}</span>
                    </span>
                  </div>
                  <div className="flex-1 flex items-center gap-2" title={rangeText("建蔽率", t.bcr)}>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full opacity-60" style={{ width: `${Math.min(100, t.bcr.mean)}%`, ...typeStyle(i) }} />
                    </div>
                    <span className="text-[10px] tabular-nums w-24 text-right">
                      {t.bcr.mean.toFixed(0)}%<span className="text-muted-foreground"> {t.bcr.min}〜{t.bcr.max}</span>
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3 text-[9px] text-muted-foreground mt-1">
                <span className="w-28" />
                <span className="flex-1 text-center">容積率 面積加重平均（範囲 最小〜最大、%）</span>
                <span className="flex-1 text-center">建蔽率 面積加重平均（範囲 最小〜最大、%）</span>
              </div>
            </div>
            <p className="source-note mt-2">
              {`出典: ${SOURCES.ksj.label}`}
              {provenance ? ` ／ ${provenance}` : ""}
              <span className="block">{ZONING_FAR_NOTE}</span>
            </p>
          </>
        )}
      </div>

      {!pending && composition !== null && (
        <>
          <KsjZoningCredits />
          <A55Notices />
        </>
      )}
    </div>
  );
}
