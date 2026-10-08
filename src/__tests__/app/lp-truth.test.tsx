import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import LandingPage, { metadata as pageMetadata } from "@/app/page";
import { metadata as layoutMetadata } from "@/app/layout";

// layout.tsx calls next/font loaders at module scope; they only exist under
// the Next compiler. Only its exported `metadata` is read here, so the loaders
// are stubbed to the shape layout.tsx consumes (`.variable`).
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Geist: font, Geist_Mono: font, Noto_Sans_JP: font };
});
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
 *   用途地域     — zoning is the bundled sample set, not open data.
 *
 * 用途地域 is exempt in exactly one place: the sample group of the data-source
 * table (tbody[data-provenance="sample"]), where it appears as a disclosure
 * that zoning IS sample data — the opposite of the claim this test guards
 * against. The exemption is checked to exist and to be the only place the
 * word occurs, so it cannot quietly widen.
 */

const EVERYWHERE = ["申請", "審査", "公示地価", "世帯"];
const OUTSIDE_SAMPLE_GROUP = ["用途地域"];
const SAMPLE_GROUP = 'tbody[data-provenance="sample"]';

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
    const all = readable(container);

    const sampleGroups = container.querySelectorAll(SAMPLE_GROUP);
    expect(sampleGroups.length, "the sample group the exemption names must exist").toBe(1);
    const outside = container.cloneNode(true) as Element;
    outside.querySelectorAll(SAMPLE_GROUP).forEach((el) => el.remove());
    const outsideText = readable(outside);

    const found = [
      ...EVERYWHERE.filter((word) => all.includes(word)),
      ...OUTSIDE_SAMPLE_GROUP.filter((word) => outsideText.includes(word)),
    ];
    expect(found, "retired claims in the Japanese LP render").toEqual([]);
  });

  it("the metadata exported by page.tsx and layout.tsx carries none of them", () => {
    const exported = JSON.stringify({ page: pageMetadata, layout: layoutMetadata });
    const found = [...EVERYWHERE, ...OUTSIDE_SAMPLE_GROUP].filter((word) => exported.includes(word));
    expect(found, "retired claims in the exported metadata").toEqual([]);
  });
});
