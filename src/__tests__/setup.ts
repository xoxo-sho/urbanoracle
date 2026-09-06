import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without `globals: true` Testing Library does not register its own cleanup,
// so a second render in the same file would find two copies of every tab.
afterEach(cleanup);

// Recharts' ResponsiveContainer observes its wrapper; jsdom has no
// ResizeObserver. A no-op is enough — the charts render nothing at 0×0, and
// the provenance copy the guards inspect sits outside the SVG anyway.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
