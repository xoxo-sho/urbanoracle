"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { fetchGated, routeFor, type GateOutcome } from "@/lib/api-gate";

export interface DataState<T> {
  data: T;
  isLoading: boolean;
  isLive: boolean;
}

/**
 * Fetch one protected endpoint and honour the two gates (design-spec-v1 §5).
 *
 * The redirect decision lives in `routeFor`, so 401 and 403+pending stay
 * distinct destinations rather than collapsing into a single failure branch.
 * Any other failure keeps the fallback data on screen: a transport hiccup is
 * not a reason to throw someone out of the dashboard.
 */
export function useGatedData<T>(endpoint: string, fallback: T): DataState<T> {
  const { getToken, loading: authLoading } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<DataState<T>>({
    data: fallback,
    isLoading: true,
    isLive: false,
  });

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

      if (outcome.kind === "ok") {
        const body = outcome.data as { data: T; isLive: boolean } | null;
        setState({
          data: body?.data ?? fallback,
          isLoading: false,
          isLive: Boolean(body?.isLive),
        });
        return;
      }

      setState({ data: fallback, isLoading: false, isLive: false });
    });

    return () => {
      cancelled = true;
    };
  }, [endpoint, fallback, getToken, authLoading, router]);

  return state;
}
