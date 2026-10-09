"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { AUTH_COPY, type AuthKey } from "@/i18n/auth";
import { useLang } from "@/i18n/lang-context";

/**
 * The decorative panel beside the sign-in form (/login, /pending), adapted
 * from origin/feat/login-panel src/components/login/LoginPanel.tsx.
 *
 * WHAT THIS IS. An abstract schematic of the SHAPE of what /app renders for a
 * signed-in user — not a reconstruction of its screens. Every slide carries
 * the same label saying so (模式図 / 実画面ではありません / 数値は含みません).
 *
 * THREE RULES, enforced by e2e/login-split.spec.ts (L6, runtime, ja and en)
 * and src/__tests__/auth/auth-dictionary.test.ts (static):
 *   - NO NUMERALS. Not a digit, full-width digit or kanji numeral anywhere in
 *     the panel, and no <text>, <title> or <desc> in any figure: axes without
 *     values, bands without shares, ramps without quantities.
 *   - NO CLAIM OF RECONSTRUCTION. Never 再現 / "recreated"; no real names.
 *   - NO INVENTED OUTPUTS. Each figure traces to an output /app renders (see
 *     the comment on each figure); the shapes are fixed patterns, not data.
 *
 * ACCESSIBILITY. aria-hidden, with no focusable element; it sits after the
 * form in the DOM.
 *
 * MOTION. All three slides share one grid cell (constant height) and only
 * opacity changes: 240ms out, then 240ms in after a 260ms delay (auth-shell.css),
 * so no frame shows two slides. The advance runs every 5200ms and skips a tick
 * while the pointer is over the panel, while focus is anywhere in the shell,
 * or while the tab is hidden — all three read at tick time, so there is no
 * listener state to fall out of step. Under prefers-reduced-motion the timer
 * never starts: slide A, static, no dots, and every duration and delay is 0s.
 */

export const AUTH_PANEL_INTERVAL_MS = 5200;

type Slide = { id: "A" | "B" | "C"; title: AuthKey; caption: AuthKey; Figure: () => React.JSX.Element };

const up = { fill: "var(--up-fill)", ui: "var(--up-ui)", strong: "var(--up-strong)", text: "var(--up-text)" };
const down = { fill: "var(--down-fill)", ui: "var(--down-ui)" };
const rule = "var(--rule-strong)";
const ink = "var(--ink-6)";

/**
 * A — 区ごとの面. Wards as a mosaic of cells shaded on one ramp, one ward
 * outlined as the selection. Traces to the choropleth in
 * src/components/map/MapView.tsx:74 (ward polygons) and :107-121 (`fill-color`
 * per active layer), the selected ward's outline at :142-153, and the ramp
 * legend in src/components/map/MapLegend.tsx. The tiling is not Tokyo's
 * geography and the shading is a fixed pattern.
 */
const MOSAIC_ROWS: { y: number; h: number; cells: { w: number; step: number }[] }[] = [
  { y: 8, h: 38, cells: [{ w: 60, step: 2 }, { w: 48, step: 3 }, { w: 72, step: 1 }, { w: 56, step: 2 }, { w: 52, step: 0 }] },
  { y: 50, h: 38, cells: [{ w: 40, step: 1 }, { w: 56, step: 2 }, { w: 48, step: 3 }, { w: 64, step: 2 }, { w: 44, step: 1 }, { w: 36, step: 0 }] },
  { y: 92, h: 38, cells: [{ w: 52, step: 0 }, { w: 44, step: 1 }, { w: 60, step: 2 }, { w: 40, step: 3 }, { w: 56, step: 3 }, { w: 36, step: 1 }] },
  { y: 134, h: 38, cells: [{ w: 48, step: 2 }, { w: 60, step: 0 }, { w: 40, step: 1 }, { w: 56, step: 1 }, { w: 44, step: 2 }, { w: 40, step: 0 }] },
];
const RAMP = [up.fill, up.ui, up.strong, up.text];
const SELECTED = { row: 1, cell: 2 };

function WardMosaic() {
  const row = MOSAIC_ROWS[SELECTED.row];
  const selectedX = 8 + row.cells.slice(0, SELECTED.cell).reduce((s, c) => s + c.w + 3, 0);
  return (
    <svg viewBox="0 0 320 200" className="block h-auto w-full" role="presentation" focusable="false">
      {MOSAIC_ROWS.map((r, ri) => {
        let x = 8;
        return r.cells.map((cell, ci) => {
          const el = <rect key={`${ri}-${ci}`} x={x} y={r.y} width={cell.w} height={r.h} rx={1} style={{ fill: RAMP[cell.step] }} />;
          x += cell.w + 3;
          return el;
        });
      })}
      <rect
        x={selectedX - 1.5}
        y={row.y - 1.5}
        width={row.cells[SELECTED.cell].w + 3}
        height={row.h + 3}
        rx={2}
        style={{ fill: "none", stroke: "var(--foreground)", strokeWidth: 2 }}
      />
      {/* ramp legend: swatches only, no quantities */}
      <line x1={8} y1={183} x2={312} y2={183} style={{ stroke: rule, strokeWidth: 1 }} />
      {RAMP.map((fill, i) => (
        <rect key={i} x={230 + i * 21} y={189} width={18} height={6} rx={1} style={{ fill }} />
      ))}
    </svg>
  );
}

/**
 * B′ — 年齢構成. One horizontal bar per ward, each split into three age bands
 * that together fill the row. Traces to the 年齢構成 chart in
 * src/components/dashboard/DemographicsChart.tsx:171-184: a vertical-layout
 * BarChart of `ageData` (:113, the eight most populous wards, sorted at :43)
 * stacked young / working-age / elderly in var(--chart-5) / (--chart-4) /
 * (--chart-3) on a full-width share axis. Its data is /api/v1/demographics
 * (src/app/app/page.tsx:75, mounted at :274-280), footnoted with the e-Stat
 * source when live (censusNote, :37-42). Ward names become plain ticks; the
 * band widths are a fixed pattern, not shares.
 */
const AGE_ROWS: [number, number, number][] = [
  [30, 182, 56],
  [34, 176, 58],
  [28, 188, 52],
  [36, 170, 62],
  [32, 178, 58],
  [26, 190, 52],
  [38, 166, 64],
  [30, 180, 58],
];
const AGE_BANDS = ["var(--chart-5)", "var(--chart-4)", "var(--chart-3)"];
const TICK_WIDTHS = [22, 16, 26, 18, 24, 16, 20, 22];

function AgeBands() {
  const left = 44;
  return (
    <svg viewBox="0 0 320 200" className="block h-auto w-full" role="presentation" focusable="false">
      {AGE_ROWS.map((bands, i) => {
        const y = 10 + i * 20;
        let x = left;
        return (
          <g key={i}>
            <rect x={left - 8 - TICK_WIDTHS[i]} y={y + 6} width={TICK_WIDTHS[i]} height={4} rx={1} style={{ fill: ink }} />
            {bands.map((w, b) => {
              const el = <rect key={b} x={x} y={y} width={w} height={16} style={{ fill: AGE_BANDS[b] }} />;
              x += w;
              return el;
            })}
          </g>
        );
      })}
      <line x1={left} y1={174} x2={312} y2={174} style={{ stroke: rule, strokeWidth: 1 }} />
      {/* band legend: swatches only, no labels */}
      <line x1={8} y1={183} x2={312} y2={183} style={{ stroke: rule, strokeWidth: 1 }} />
      {AGE_BANDS.map((fill, i) => (
        <rect key={i} x={251 + i * 21} y={189} width={18} height={6} rx={1} style={{ fill }} />
      ))}
    </svg>
  );
}

/**
 * C — 重ね合わせ. An outline with a hazard raster over part of it and station
 * marks sized by scale. Traces to the GSI hazard rasters in
 * src/components/map/MapView.tsx:195-219 (flood, tsunami; tiles fetched
 * client-side) and the station circles whose radius follows ridership at
 * :158-172. The outline is not a ward, the raster is a pattern, the circle
 * sizes are fixed.
 */
const OUTLINE = "M22 42 L96 18 L176 26 L246 12 L302 48 L288 118 L246 186 L150 176 L84 190 L30 150 L14 96 Z";
const RASTER: { x: number; y: number; deep: boolean }[] = [];
for (let gy = 0; gy < 6; gy++) {
  for (let gx = 0; gx < 8; gx++) {
    // a fixed blob: cells inside an ellipse are "flooded", the inner ones deep
    const cx = gx - 3.2;
    const cy = gy - 2.4;
    const d = (cx * cx) / 9 + (cy * cy) / 4.5;
    if (d <= 1) RASTER.push({ x: 150 + gx * 15, y: 74 + gy * 15, deep: d <= 0.42 });
  }
}
const STATIONS: { cx: number; cy: number; r: number }[] = [
  { cx: 60, cy: 74, r: 16 },
  { cx: 118, cy: 58, r: 9 },
  { cx: 96, cy: 128, r: 12 },
  { cx: 176, cy: 150, r: 7 },
  { cx: 236, cy: 62, r: 11 },
  { cx: 262, cy: 132, r: 6 },
];

function Overlay() {
  return (
    <svg viewBox="0 0 320 200" className="block h-auto w-full" role="presentation" focusable="false">
      <path d={OUTLINE} style={{ fill: "var(--card)", stroke: rule, strokeWidth: 1.2 }} />
      {RASTER.map((c, i) => (
        <rect
          key={i}
          x={c.x}
          y={c.y}
          width={13}
          height={13}
          rx={1}
          style={{ fill: c.deep ? down.ui : down.fill, opacity: c.deep ? 0.9 : 0.85 }}
        />
      ))}
      <polyline
        points={STATIONS.map((s) => `${s.cx},${s.cy}`).join(" ")}
        style={{ fill: "none", stroke: ink, strokeWidth: 1, strokeDasharray: "3 3" }}
      />
      {STATIONS.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={s.r} style={{ fill: up.strong, fillOpacity: 0.2, stroke: up.text, strokeWidth: 1.2 }} />
      ))}
    </svg>
  );
}

const SLIDES: Slide[] = [
  { id: "A", title: "slideATitle", caption: "slideACaption", Figure: WardMosaic },
  { id: "B", title: "slideBTitle", caption: "slideBCaption", Figure: AgeBands },
  { id: "C", title: "slideCTitle", caption: "slideCCaption", Figure: Overlay },
];

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// jsdom (the unit-test DOM) has no matchMedia; it gets the animated default.
function subscribeReducedMotion(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;
const reducedMotionOnServer = () => false;

export default function AuthPanel({ focusScope }: { focusScope: RefObject<HTMLElement | null> }) {
  const { lang } = useLang();
  const t = AUTH_COPY[lang];
  const reduced = useSyncExternalStore(subscribeReducedMotion, reducedMotion, reducedMotionOnServer);
  const [index, setIndex] = useState(0);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (panel.current?.matches(":hover")) return;
      if (focusScope.current?.matches(":focus-within")) return;
      setIndex((i) => (i + 1) % SLIDES.length);
    }, AUTH_PANEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reduced, focusScope]);

  const shown = reduced ? 0 : index;

  return (
    <aside
      ref={panel}
      aria-hidden="true"
      data-auth-panel=""
      data-panel-index={shown}
      data-reduced-motion={reduced ? "true" : "false"}
    >
      <div data-auth-panel-inner="">
        <div data-auth-stage="">
          {SLIDES.map((slide, i) => (
            <div key={slide.id} data-auth-slide="" data-slide-id={slide.id} data-active={i === shown ? "true" : "false"}>
              <div data-auth-plate="">
                <slide.Figure />
              </div>
              <p data-auth-slide-title="">{t[slide.title]}</p>
              <p data-auth-slide-caption="">{t[slide.caption]}</p>
              <p data-auth-label="">{t.panelLabel}</p>
            </div>
          ))}
        </div>
        {!reduced && (
          // Indicators, not controls: no role, no handler, no tab stop.
          <div data-auth-dots="">
            {SLIDES.map((slide, i) => (
              <span key={slide.id} data-auth-dot="" data-active={i === shown ? "true" : "false"} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
