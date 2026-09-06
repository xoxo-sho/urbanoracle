import { ImageResponse } from "next/og";

/**
 * Social card (design-spec-v1 §0, §2).
 *
 * Editorial/atlas: cream ground, ink type, and the two axis colours carrying
 * the only meaning on the card. No gradient, no illustration, no emoji — the
 * H項 list applies to the image the internet sees first.
 *
 * Tokens are literal here because an ImageResponse is rendered outside the
 * document and cannot read CSS variables.
 */

// Generated at build time, like the other metadata routes under
// output:"export".
export const dynamic = "force-static";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "UrbanOracle — 東京23区の上振れと下振れ";

const CREAM = "#FAF7F1";
const INK = "#1A1814";
const NAVY = "#16305C";
const COPPER = "#6E2417";
const RULE = "rgba(26,24,20,0.18)";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: CREAM,
          color: INK,
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 6, color: "#5C574E" }}>
          URBANORACLE
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 62, lineHeight: 1.25, fontWeight: 700 }}>
            都市の資産価値を、
          </div>
          <div style={{ display: "flex", fontSize: 62, lineHeight: 1.25, fontWeight: 700 }}>
            上振れと下振れの両面から。
          </div>
        </div>

        {/* The axis, stated as two bars rather than described in words. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", width: 320, height: 12, background: NAVY }} />
            <div style={{ display: "flex", fontSize: 24, color: NAVY }}>上振れ 地価・人口・交通</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", width: 190, height: 12, background: COPPER }} />
            <div style={{ display: "flex", fontSize: 24, color: COPPER }}>下振れ 災害リスク</div>
          </div>
          <div style={{ display: "flex", height: 1, background: RULE, marginTop: 10 }} />
          <div style={{ display: "flex", fontSize: 18, letterSpacing: 4, color: "#5C574E" }}>
            TOKYO 23 WARDS — LAND VALUE × RISK
          </div>
        </div>
      </div>
    ),
    size
  );
}
