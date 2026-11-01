"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { fetchGated, routeFor, type GateOutcome } from "@/lib/api-gate";
import type { FieldSource, FieldSources } from "@/types";

/**
 * Where one endpoint's answer stands (RECON 2026-10-uo-real-data §7.2):
 *
 *   loading      request in flight — no numbers yet
 *   ok           the server answered with everything it was asked for
 *   partial      it answered, but `unavailable` names record fields the
 *                upstream did not deliver (e.g. dailyPassengers with ODPT down)
 *   unavailable  the surface could not get its data: HTTP 503
 *                {status:"unavailable"}, any other non-2xx, a transport
 *                failure, or a 2xx body without `data`
 *
 * The states are never merged: a consumer renders 読み込み中, 取得失敗, or the
 * figures — and never a stale or sample number in their place.
 */
export type DataStatus = "loading" | "ok" | "partial" | "unavailable";

export interface DataState<T> {
  status: DataStatus;
  /** The payload; null unless status is ok or partial. */
  data: T | null;
  /** Record fields the server could not fill (status partial); [] otherwise. */
  unavailable: string[];
  /** Whether the figures came from the upstream source (the /disaster-risks payload is still the sample set). */
  isLive: boolean;
  /** When the server obtained the live data from upstream (ISO 8601), if it says. */
  fetchedAt: string | null;
  /** Per record field, the year and table the figures came from, if the server says; {} otherwise. */
  sources: FieldSources;
}

const LOADING: DataState<never> = {
  status: "loading",
  data: null,
  unavailable: [],
  isLive: false,
  fetchedAt: null,
  sources: {},
};

const UNAVAILABLE: DataState<never> = {
  status: "unavailable",
  data: null,
  unavailable: [],
  isLive: false,
  fetchedAt: null,
  sources: {},
};

/**
 * Fetch one protected endpoint and honour the two gates (design-spec-v1 §5).
 *
 * The redirect decision lives in `routeFor`, so 401 and 403+pending stay
 * distinct destinations rather than collapsing into a single failure branch.
 * Any other failure is reported as `unavailable`: a transport hiccup is not a
 * reason to throw someone out of the dashboard, and not a reason to show them
 * numbers that did not arrive.
 */
export function useGatedData<T>(endpoint: string): DataState<T> {
  const { getToken, loading: authLoading } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<DataState<T>>(LOADING);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    void fetchGated(endpoint, getToken).then((outcome: GateOutcome) => {
      if (cancelled) return;

      const destination = routeFor(outcome);
      if (destination) {
        router.replace(destination);
        return;
      }

      setState(outcome.kind === "ok" ? fromBody<T>(outcome.data) : UNAVAILABLE);
    });

    return () => {
      cancelled = true;
    };
  }, [endpoint, getToken, authLoading, router]);

  return state;
}

/** A 2xx body. Without `data` it is unavailable: there is nothing honest to show. */
function fromBody<T>(raw: unknown): DataState<T> {
  if (!raw || typeof raw !== "object") return UNAVAILABLE;
  const body = raw as {
    status?: unknown;
    data?: unknown;
    unavailable?: unknown;
    isLive?: unknown;
    fetchedAt?: unknown;
    sources?: unknown;
  };
  if (body.data === undefined || body.data === null) return UNAVAILABLE;

  const unavailable = Array.isArray(body.unavailable)
    ? body.unavailable.filter((field): field is string => typeof field === "string")
    : [];

  return {
    status: body.status === "partial" || unavailable.length > 0 ? "partial" : "ok",
    data: body.data as T,
    unavailable,
    isLive: Boolean(body.isLive),
    fetchedAt: typeof body.fetchedAt === "string" ? body.fetchedAt : null,
    sources: fieldSources(body.sources),
  };
}

/** Only well-formed entries are kept: a year, a table and a label, nothing invented for the rest. */
function fieldSources(raw: unknown): FieldSources {
  if (!raw || typeof raw !== "object") return {};
  const out: FieldSources = {};
  for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const { year, table, label } = value as Partial<FieldSource>;
    if (typeof year === "number" && Number.isFinite(year) && typeof table === "string" && typeof label === "string") {
      out[field] = { year, table, label };
    }
  }
  return out;
}
