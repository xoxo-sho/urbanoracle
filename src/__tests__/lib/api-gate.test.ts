import { describe, expect, it, vi } from "vitest";
import {
  PENDING_STATUS,
  classifyResponse,
  fetchGated,
  routeFor,
  type GateOutcome,
} from "@/lib/api-gate";

/**
 * The second-gate wiring (design-spec-v1 §5).
 *
 * These are the three outcomes the backend produces, proven distinct on the
 * client side with mocked responses. Real GIP sign-in is not exercised here
 * and cannot be until the web app exists (Stage 5) and the service is
 * deployed (Stage 6/7) — this proves the routing join only.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const token = async () => "dummy-id-token";

describe("classifyResponse — the three outcomes", () => {
  it("401 is unauthenticated", async () => {
    expect(await classifyResponse(json(401, { detail: "Not authenticated" }))).toEqual({
      kind: "unauthenticated",
    });
  });

  it("403 with pending_activation is pending", async () => {
    expect(await classifyResponse(json(403, { status: PENDING_STATUS }))).toEqual({
      kind: "pending",
    });
  });

  it("200 carries the payload", async () => {
    const outcome = await classifyResponse(json(200, { data: [1, 2], isLive: true }));
    expect(outcome.kind).toBe("ok");
    expect((outcome as { data: unknown }).data).toEqual({ data: [1, 2], isLive: true });
  });

  it("a 403 that is NOT pending_activation is not reported as pending", async () => {
    // Narrating an unrecognised denial as "you are in the review queue" would
    // be a fabricated explanation.
    const outcome = await classifyResponse(json(403, { detail: "forbidden" }));
    expect(outcome).toEqual({ kind: "error", status: 403 });
  });

  it("a 403 with an unparseable body is not reported as pending", async () => {
    const outcome = await classifyResponse(new Response("<html>", { status: 403 }));
    expect(outcome).toEqual({ kind: "error", status: 403 });
  });

  it("500 is an error, not an auth decision", async () => {
    expect(await classifyResponse(json(500, {}))).toEqual({ kind: "error", status: 500 });
  });
});

describe("routeFor — destinations stay distinct", () => {
  it("routes each outcome to its own destination", () => {
    expect(routeFor({ kind: "unauthenticated" })).toBe("/login");
    expect(routeFor({ kind: "pending" })).toBe("/pending");
    expect(routeFor({ kind: "ok", data: null })).toBeNull();
    expect(routeFor({ kind: "error", status: 500 })).toBeNull();
  });

  it("401 and 403+pending never collapse to the same route", () => {
    // The regression this guards: sending a pending user back to a sign-in
    // screen they already used correctly, which reads as a broken login.
    expect(routeFor({ kind: "unauthenticated" })).not.toBe(routeFor({ kind: "pending" }));
  });
});

describe("fetchGated — end-to-end wiring against mocked responses", () => {
  it("401 mock routes to /login", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(401, {})));
    const outcome = await fetchGated("/api/v1/land-prices", token);
    expect(outcome.kind).toBe("unauthenticated");
    expect(routeFor(outcome)).toBe("/login");
    vi.unstubAllGlobals();
  });

  it("403+pending mock routes to /pending", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(403, { status: PENDING_STATUS })));
    const outcome = await fetchGated("/api/v1/land-prices", token);
    expect(outcome.kind).toBe("pending");
    expect(routeFor(outcome)).toBe("/pending");
    vi.unstubAllGlobals();
  });

  it("200 mock renders in place (no redirect)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { data: [], isLive: false })));
    const outcome = await fetchGated("/api/v1/land-prices", token);
    expect(outcome.kind).toBe("ok");
    expect(routeFor(outcome)).toBeNull();
    vi.unstubAllGlobals();
  });

  it("the three mocked outcomes are mutually distinct", async () => {
    const cases: Array<[number, unknown, GateOutcome["kind"], string | null]> = [
      [401, {}, "unauthenticated", "/login"],
      [403, { status: PENDING_STATUS }, "pending", "/pending"],
      [200, { data: [], isLive: true }, "ok", null],
    ];
    const seen = new Set<string>();
    for (const [status, body, kind, route] of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => json(status, body)));
      const outcome = await fetchGated("/api/v1/demographics", token);
      expect(outcome.kind).toBe(kind);
      expect(routeFor(outcome)).toBe(route);
      seen.add(`${outcome.kind}:${routeFor(outcome)}`);
      vi.unstubAllGlobals();
    }
    expect(seen.size).toBe(3);
  });

  it("attaches the caller's bearer token", async () => {
    const spy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => json(200, { data: [], isLive: true })
    );
    vi.stubGlobal("fetch", spy);
    await fetchGated("/api/v1/transport", async () => "abc123");
    const init = spy.mock.calls[0][1];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer abc123");
    vi.unstubAllGlobals();
  });

  it("no token means unauthenticated without a network call", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await fetchGated("/api/v1/transport", async () => null)).toEqual({
      kind: "unauthenticated",
    });
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("a transport failure is not treated as an auth decision", async () => {
    // Otherwise a tunnel would sign the user out.
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));
    const outcome = await fetchGated("/api/v1/transport", token);
    expect(outcome).toEqual({ kind: "error", status: 0 });
    expect(routeFor(outcome)).toBeNull();
    vi.unstubAllGlobals();
  });
});
