import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import LandingPage, { metadata as pageMetadata } from "@/app/page";
import { metadata as layoutMetadata } from "@/app/layout";

// layout.tsx calls the next/font/local loader at module scope (the two heading
// subsets); it only exists under the Next compiler. Only its exported
// `metadata` is read here, so the loader is stubbed to the shape layout.tsx
// consumes (`.variable`). The other faces are plain CSS (styles/fonts.css).
vi.mock("next/font/local", () => ({
  default: () => ({ variable: "", className: "", style: { fontFamily: "" } }),
}));

/**
 * Landing-page truth (copy corrections from the truth check, T1–T5).
 *
 * Each word below marked a claim the code does not support:
 *   申請 / 審査  — registration is open; a verified email is the only
 *                  condition (backend/core/provisioning.py:29-39), so there is
 *                  nothing to apply for and no review.
 *   公示地価     — nothing fetches official land prices; the YoY figures shown
 *                  are the bundled sample set.
 *   世帯         — the e-Stat fetch carries no household field.
 *
 * 用途地域 was a retired claim too (zoning was the bundled sample set) and was
 * exempt only in the sample group of the data-source table. Since real-data
 * plan PR 6 the 用途地域 surfaces read the 国土数値情報 A55-24 snapshot: the word
 * now belongs in the live group (tbody[data-provenance="live"]) and must not
 * appear in the sample group, which is checked here the other way round.
 */

const EVERYWHERE = ["申請", "審査", "公示地価", "世帯"];
// Real-data plan PR 6: the A55 page's 注意事項 are shown verbatim on the LP, and
// the first of them reads 「建築確認申請や不動産重要事項説明等の手続に用いることを
// 保証するものではなく…」. That 申請 is the provider's sentence about building
// permits, not the product claiming an application step, so the block that
// carries the provider's own wording ([data-notices="a55"]) is read out of
// the scan — and only that block: the exemption is checked to exist.
const PROVIDER_VERBATIM = '[data-notices="a55"]';
const OUTSIDE_SAMPLE_GROUP: string[] = [];
const SAMPLE_GROUP = 'tbody[data-provenance="sample"]';
const LIVE_GROUP = 'tbody[data-provenance="live"]';
// Real-data plan PR 6: a live claim, listed under 実データ and never under the sample group.
const LIVE_ONLY = ["用途地域"];

/** Rendered text plus every attribute a reader or assistive tech is given. */
function readable(root: Element): string {
  const attrs = [...root.querySelectorAll("[aria-label], [title], [alt]")].flatMap((el) =>
    ["aria-label", "title", "alt"].map((name) => el.getAttribute(name) ?? "")
  );
  return [root.textContent ?? "", ...attrs].join("\n");
}

describe("landing page copy says only what the code does", () => {
  it("the Japanese render carries none of the retired claims", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelectorAll(PROVIDER_VERBATIM).length, "the provider-verbatim block the exemption names must exist").toBe(1);
    const productCopy = container.cloneNode(true) as Element;
    productCopy.querySelectorAll(PROVIDER_VERBATIM).forEach((el) => el.remove());
    const all = readable(productCopy);

    // Real-data plan PR 4b: the last sample row (乗降客数推移) became a live one,
    // so the group the exemption once named is gone and nothing is exempt.
    const sampleGroups = container.querySelectorAll(SAMPLE_GROUP);
    expect(sampleGroups.length, "no sample group is left on the LP").toBe(0);
    const outside = productCopy.cloneNode(true) as Element;
    outside.querySelectorAll(SAMPLE_GROUP).forEach((el) => el.remove());
    const outsideText = readable(outside);

    const found = [
      ...EVERYWHERE.filter((word) => all.includes(word)),
      ...OUTSIDE_SAMPLE_GROUP.filter((word) => outsideText.includes(word)),
    ];
    expect(found, "retired claims in the Japanese LP render").toEqual([]);

    const liveText = readable(container.querySelector(LIVE_GROUP)!);
    for (const word of LIVE_ONLY) {
      expect(liveText, `${word} listed as live`).toContain(word);
    }
  });

  it("the metadata exported by page.tsx and layout.tsx carries none of them", () => {
    const exported = JSON.stringify({ page: pageMetadata, layout: layoutMetadata });
    const found = [...EVERYWHERE, ...OUTSIDE_SAMPLE_GROUP].filter((word) => exported.includes(word));
    expect(found, "retired claims in the exported metadata").toEqual([]);
  });
});
