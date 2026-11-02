"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from "recharts";
import type { DemographicsData, FieldSources, LandPriceWard } from "@/types";
import type { DataStatus } from "@/lib/use-gated-data";
import { hasValue } from "@/lib/format";
import { TOOLTIP_STYLE, AXIS_STYLE, CURSOR_STYLE, CHART_COLORS } from "@/lib/chart-theme";
import { LAND_USE_LABEL, formatChange, industrialCount, manPrice, manY, priceGap, type LandUse } from "@/lib/land-price";
import { censusLine, landPriceLine } from "@/lib/census-sources";
import { ESTAT_SOURCE, LAND_PRICE_CHANGE_NOTE, LAND_PRICE_MEAN_NOTE } from "@/lib/credits";
import { SOURCES } from "@/lib/sources";
import SourceNote from "@/components/dashboard/SourceNote";
import { KsjLandPriceCredits } from "@/components/dashboard/RequiredCredits";
import { StateNotice, isPending, type PendingStatus } from "@/components/dashboard/DataState";

/**
 * 地価 tab (real-data plan PR 5): the 区別平均価格 bar and the 密度 vs 地価
 * scatter, both from the committed 地価公示 snapshot (/api/v1/land-prices) for
 * the use the page's switch chose — 住宅地 or 商業地 — every figure with its n.
 *
 * The bar shows the top wards of the use and always the selected ward; 格差 is
 * the highest ward mean over the lowest, recomputed per use. The scatter keeps
 * all 23 wards whatever the selection and highlights the selected one, with
 * its y domain from all 23 (RECON §4 defect c); x and z are the census
 * payload's, so a ward the census does not list gets no point — never one at
 * an invented coordinate — and while either half is loading or failed the
 * scatter says so, never an empty plot (the Architect's addition of
 * 2026-10-30). Every year and table named here is read from the payloads.
 */

interface LandPriceChartProps {
  /** The /land-prices payload: one record per ward; [] while pending. */
  wards: LandPriceWard[];
  /** State of the /land-prices answer. */
  status: DataStatus;
  /** The /land-prices payload's `sources`: per field, the 地価公示 edition and its year. */
  sources?: FieldSources;
  landUse: LandUse;
  /** The /demographics payload: the scatter's x (density) and z (population). */
  demographics: DemographicsData[];
  demographicsStatus: DataStatus;
  demographicsSources?: FieldSources;
  selectedWard: string | null;
}

/** In the 23-ward view the bar shows this many wards; the selected ward is added when outside them. */
const TOP_N = 10;

export default function LandPriceChart({
  wards,
  status,
  sources = {},
  landUse,
  demographics,
  demographicsStatus,
  demographicsSources = {},
  selectedWard,
}: LandPriceChartProps) {
  const use = LAND_USE_LABEL[landUse];
  const provenance = landPriceLine(sources);
  const landSourceName = `地価公示: ${SOURCES.ksj.label}`;
  const censusSourceName = `人口密度・人口: ${SOURCES.estat.label}`;
  const landPending = isPending(status);

  // Bar: the use's means, highest first; the selected ward joins the shown
  // bars when it is not already among them.
  const ranked = [...wards].sort((a, b) => b[landUse].meanPrice - a[landUse].meanPrice);
  const top = ranked.slice(0, TOP_N);
  const selectedRow = selectedWard ? ranked.find((w) => w.region === selectedWard) : undefined;
  const added = selectedRow !== undefined && !top.includes(selectedRow);
  const shown = added ? [...top, selectedRow] : top;
  const barData = shown.map((w) => ({
    region: w.region,
    meanPrice: w[landUse].meanPrice,
    n: w[landUse].n,
    change: w[landUse].meanChange,
    selected: w.region === selectedWard,
  }));
  const gap = priceGap(wards, landUse);
  const cut = wards.length > shown.length;

  // Scatter: all wards that both payloads cover; the y domain from every ward
  // of the 地価 payload, never from the one point a selection would leave.
  const scatterData = wards.flatMap((w) => {
    const demo = demographics.find((d) => d.region === w.region);
    if (!demo || !hasValue(demo.density) || !hasValue(demo.population)) return [];
    return [
      {
        name: w.region.replace("区", ""),
        region: w.region,
        x: demo.density,
        y: manY(w[landUse].meanPrice),
        z: demo.population,
        n: w[landUse].n,
        selected: w.region === selectedWard,
      },
    ];
  });
  const yMax = wards.length ? Math.max(...wards.map((w) => manY(w[landUse].meanPrice))) : 0;
  const scatterPending: PendingStatus | null =
    status === "unavailable" || demographicsStatus === "unavailable"
      ? "unavailable"
      : landPending || isPending(demographicsStatus)
        ? "loading"
        : null;
  const scatterSourceName = [landPending ? landSourceName : null, isPending(demographicsStatus) ? censusSourceName : null]
    .filter((s): s is string => s !== null)
    .join(" ／ ");
  const censusNote = censusLine(demographicsSources, ["density", "population"]);

  return (
    <div className="space-y-3">
      {/* Bar: land price ranking — hero */}
      <div className="chart-section" data-surface="land-price-bar">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            区別平均価格（{use}）
          </h4>
          {gap && !landPending && (
            <span className="text-[10px] text-muted-foreground" data-gap>
              格差 <span className="text-foreground font-bold">{gap.ratio}倍</span>
              <span className="ml-1">({gap.top.replace("区", "")} vs {gap.bottom.replace("区", "")})</span>
            </span>
          )}
        </div>
        {landPending ? (
          <StateNotice status={status} source={landSourceName} />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} barCategoryGap="18%">
                <XAxis dataKey="region" {...AXIS_STYLE} tickFormatter={(v) => String(v).replace("区", "")} />
                <YAxis {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} width={40} tickFormatter={(v) => `${(Number(v) / 10000).toFixed(0)}万`} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={CURSOR_STYLE}
                  formatter={(v, _name, item) => {
                    const row = item?.payload as { n?: number; change?: number | null } | undefined;
                    return [
                      `${(Number(v) / 10000).toFixed(1)}万円/m²（n=${row?.n ?? "—"}、変動率 ${formatChange(row?.change ?? null)}）`,
                      `平均価格（${use}）`,
                    ];
                  }}
                />
                <Bar dataKey="meanPrice" radius={[3, 3, 0, 0]}>
                  {barData.map((entry, i) => (
                    <Cell
                      key={entry.region}
                      fill={entry.selected ? CHART_COLORS.upside : CHART_COLORS.neutral1}
                      opacity={selectedWard ? (entry.selected ? 1 : 0.3) : 1 - i * 0.07}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* The bars as text, for assistive technology and for the guards: the
                chart itself is an SVG a screen reader cannot read. */}
            <ul className="sr-only" data-bars>
              {barData.map((b) => (
                <li key={b.region} data-bar data-ward={b.region} data-selected={String(b.selected)}>
                  {b.region} {manPrice(b.meanPrice)}円/m² n={b.n}
                </li>
              ))}
            </ul>
            <ul className="sr-only" data-ward-prices>
              {wards.map((w) => (
                <li
                  key={w.region}
                  data-ward-price
                  data-ward={w.region}
                  data-use={landUse}
                  data-mean={w[landUse].meanPrice}
                  data-n={w[landUse].n}
                  data-change={w[landUse].meanChange ?? ""}
                  data-n-continuing={w[landUse].nContinuing}
                >
                  {w.region} 平均価格（{use}） {manPrice(w[landUse].meanPrice)}円/m² n={w[landUse].n} 変動率 {formatChange(w[landUse].meanChange)}（継続地点 {w[landUse].nContinuing}）
                </li>
              ))}
            </ul>
            {cut ? (
              <p className="source-note" data-bar-cut>
                上位{TOP_N}区{added ? "＋選択区" : ""}／全{wards.length}区
              </p>
            ) : null}
            <SourceNote
              source="ksj"
              unit="円/m²"
              year={provenance ?? undefined}
              note={`${LAND_PRICE_MEAN_NOTE}。${LAND_PRICE_CHANGE_NOTE}。工業地は区別の系列を示しません（23区で${industrialCount(wards)}地点）`}
            />
          </>
        )}
      </div>

      {/* Scatter: the cross-analysis — this is the real insight */}
      <div className="chart-section" data-surface="land-price-scatter">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            密度 vs 地価（{use}）
          </h4>
          <span className="text-[9px] text-muted-foreground">
            円の大きさ = 人口
          </span>
        </div>
        {scatterPending ? (
          <StateNotice status={scatterPending} source={scatterSourceName} />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <ScatterChart>
                <XAxis dataKey="x" type="number" {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} />
                <YAxis dataKey="y" type="number" domain={[0, yMax]} {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} tickFormatter={(v) => `${Number(v).toFixed(0)}万`} width={40} />
                <ZAxis dataKey="z" range={[30, 180]} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ""}
                  formatter={(value, name) => {
                    if (name === "x") return [`${Number(value).toLocaleString()}/km²`, "密度"];
                    if (name === "y") return [`${Number(value).toFixed(1)}万/m²`, `地価（${use}）`];
                    return [Number(value).toLocaleString(), "人口"];
                  }}
                />
                <Scatter data={scatterData} fill={CHART_COLORS.neutral1}>
                  {scatterData.map((p) => (
                    <Cell
                      key={p.region}
                      fill={p.selected ? CHART_COLORS.upside : CHART_COLORS.neutral1}
                      opacity={selectedWard ? (p.selected ? 1 : 0.35) : 0.75}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <ul className="sr-only" data-points data-y-domain-max={yMax}>
              {scatterData.map((p) => (
                <li key={p.region} data-point data-ward={p.region} data-x={p.x} data-y={p.y} data-z={p.z} data-selected={String(p.selected)}>
                  {p.region} 密度 {p.x.toLocaleString()}/km² 地価（{use}） {p.y}万/m² 人口 {p.z.toLocaleString()}
                </li>
              ))}
            </ul>
            <SourceNote
              source="ksj"
              unit="万円/m² × 人/km²"
              year={provenance ?? undefined}
              note={`密度・人口: ${ESTAT_SOURCE}${censusNote ? ` ／ ${censusNote}` : ""}`}
            />
          </>
        )}
      </div>

      {!landPending && <KsjLandPriceCredits />}
    </div>
  );
}
