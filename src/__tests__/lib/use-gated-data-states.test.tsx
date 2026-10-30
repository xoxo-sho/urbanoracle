import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGatedData } from "@/lib/use-gated-data";

/**
 * PR 1 of the real-data plan (RECON 2026-10-uo-real-data §7.1 F6–F8, §7.2):
 * the hook has no fallback.
 *
 * Three states, never merged into one another: `loading` (no numbers yet),
 * `unavailable` (the surface could not get its data), and data. Today the
 * hook starts on the caller's sample set (F6), returns to it on a body
 * without `data` (F7) and on every network or non-2xx failure (F8), so a
 * consumer cannot tell "e-Stat is down" from "here are the numbers".
 *
 * Stage 2 architect decisions: a full failure arrives as HTTP 503 with the
 * body `{status:"unavailable"}` (CHANGE 1); a partial answer arrives as 200
 * with `status:"partial"` and `unavailable` naming the record field the
 * upstream did not deliver (CHANGE 2). The hook passes both through.
 *
 * RED on main (8d17736).
 */

type Status = "loading" | "ok" | "partial" | "unavailable";
interface StateUnderTest<T> {
  status: Status;
  data: T | null;
  /** Record fields the server could not fill (status partial); [] otherwise. */
  unavailable: string[];
  isLive: boolean;
  fetchedAt: string | null;
}

// The contract this PR gives the hook: one argument, a `status`, `data`
// present in ok and partial and null in loading and unavailable. Cast once
// so the file type-checks on main as well as after the fix.
const useStates = useGatedData as unknown as <T>(endpoint: string) => StateUnderTest<T>;

// Stable identities: a fresh getToken or router per render would re-run the
// hook's effect on every state update.
const auth = vi.hoisted(() => ({ getToken: async () => "id-token" }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, getToken: auth.getToken, refresh: async () => null }),
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type Row = { region: string };
const ROWS: Row[] = [{ region: "江東区" }];

const settled = (result: { current: StateUnderTest<Row[]> }) =>
  waitFor(() => expect(result.current.status).not.toBe("loading"));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useGatedData — 読み込み中 is a state, not the sample", () => {
  it("takes no fallback argument", () => {
    expect(useGatedData.length).toBe(1);
  });

  it("before the response resolves: status loading, data null", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const { result } = renderHook(() => useStates<Row[]>("/api/v1/x"));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();
  });
});

describe("useGatedData — every failure is 取得失敗 (status unavailable, data null)", () => {
  it("network failure (F8)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    const { result } = renderHook(() => useStates<Row[]>("/api/v1/x"));
    await settled(result);
    expect(result.current.status).toBe("unavailable");
    expect(result.current.data).toBeNull();
  });

  it("non-2xx (F8)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(500, { detail: "boom" })));
    const { result } = renderHook(() => useStates<Row[]>("/api/v1/x"));
    await settled(result);
    expect(result.current.status).toBe("unavailable");
    expect(result.current.data).toBeNull();
  });

  it("503 whose body says status unavailable and carries no data (the server's failure shape)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(503, { status: "unavailable" })));
    const { result } = renderHook(() => useStates<Row[]>("/api/v1/x"));
    await settled(result);
    expect(result.current.status).toBe("unavailable");
    expect(result.current.data).toBeNull();
  });

  it("200 whose body has no data field at all (F7)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { isLive: true })));
    const { result } = renderHook(() => useStates<Row[]>("/api/v1/x"));
    await settled(result);
    expect(result.current.status).toBe("unavailable");
    expect(result.current.data).toBeNull();
  });
});

describe("useGatedData — data is data", () => {
  it("200 with rows → status ok, the rows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { status: "ok", data: ROWS, isLive: true })));
    const { result } = renderHook(() => useStates<Row[]>("/api/v1/x"));
    await settled(result);
    expect(result.current.status).toBe("ok");
    expect(result.current.data).toEqual(ROWS);
  });

  it("200 with an empty list → status ok, [] (empty is data, not a failure)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { status: "ok", data: [], isLive: true })));
    const { result } = renderHook(() => useStates<Row[]>("/api/v1/x"));
    await settled(result);
    expect(result.current.status).toBe("ok");
    expect(result.current.data).toEqual([]);
    expect(result.current.unavailable).toEqual([]);
  });

  it("200 with status partial → status partial, the rows, and the fields the server could not fill", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(200, { status: "partial", data: ROWS, unavailable: ["dailyPassengers"], isLive: false }))
    );
    const { result } = renderHook(() => useStates<Row[]>("/api/v1/x"));
    await settled(result);
    expect(result.current.status).toBe("partial");
    expect(result.current.data).toEqual(ROWS);
    expect(result.current.unavailable).toEqual(["dailyPassengers"]);
  });
});
