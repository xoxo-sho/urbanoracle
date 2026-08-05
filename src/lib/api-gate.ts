/**
 * The client half of the two gates (design-spec-v1 §5).
 *
 * The backend answers with three outcomes and they mean different things:
 *
 *   401                                 we do not know who you are      -> /login
 *   403 {"status":"pending_activation"} we know exactly who you are,
 *                                       and the answer is "not yet"     -> /pending
 *   200                                 render
 *
 * Collapsing 401 and 403 into one "not allowed" branch would send a person
 * whose account is awaiting approval back to a sign-in screen they have
 * already used correctly, which reads as a broken login. They stay separate
 * all the way to the redirect.
 *
 * A 403 whose body is NOT pending_activation is deliberately NOT treated as
 * pending: an unrecognised denial must not be narrated as "you are in the
 * queue" when it might be something else.
 */

export type GateOutcome =
  | { kind: "ok"; data: unknown }
  | { kind: "unauthenticated" }
  | { kind: "pending" }
  | { kind: "error"; status: number };

export const PENDING_STATUS = "pending_activation";

export async function classifyResponse(response: Response): Promise<GateOutcome> {
  if (response.status === 401) return { kind: "unauthenticated" };

  if (response.status === 403) {
    const body = await response.json().catch(() => null);
    if (body && typeof body === "object" && (body as { status?: unknown }).status === PENDING_STATUS) {
      return { kind: "pending" };
    }
    return { kind: "error", status: 403 };
  }

  if (!response.ok) return { kind: "error", status: response.status };

  const data = await response.json().catch(() => null);
  return { kind: "ok", data };
}

/** Where a given outcome sends the browser, or null to stay put. */
export function routeFor(outcome: GateOutcome): string | null {
  switch (outcome.kind) {
    case "unauthenticated":
      return "/login";
    case "pending":
      return "/pending";
    default:
      return null;
  }
}

export type TokenProvider = () => Promise<string | null>;

/**
 * Fetch a protected endpoint with the caller's ID token attached.
 *
 * No token means unauthenticated — reported without a network round trip, so
 * a signed-out browser cannot be told anything by the server it should not
 * hear, and cannot mistake a network failure for an auth decision.
 */
export async function fetchGated(
  path: string,
  getToken: TokenProvider,
  init?: RequestInit
): Promise<GateOutcome> {
  const token = await getToken();
  if (!token) return { kind: "unauthenticated" };

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    // A transport failure is not an authorization decision; saying so would
    // bounce a signed-in user to /login every time their train enters a tunnel.
    return { kind: "error", status: 0 };
  }

  return classifyResponse(response);
}
