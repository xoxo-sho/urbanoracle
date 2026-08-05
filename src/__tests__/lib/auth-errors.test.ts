import { describe, expect, it } from "vitest";
import { SHARED_TENANT_EMAIL_IN_USE, authErrorMessage } from "@/lib/auth-errors";

describe("Auth error copy", () => {
  it.each([
    "auth/too-many-requests",
    "auth/invalid-email",
    "auth/email-already-in-use",
  ])("maps %s to Japanese copy", (code) => {
    const message = authErrorMessage({ code });
    expect(message).not.toBe("");
    // Must be real Japanese copy, not a passed-through code.
    expect(message).toMatch(/[ぁ-んァ-ヶ一-龯]/);
    expect(message).not.toContain("auth/");
  });

  it("explains the shared-tenant consequence for an in-use address", () => {
    const message = authErrorMessage({ code: "auth/email-already-in-use" });
    expect(message).toBe(SHARED_TENANT_EMAIL_IN_USE);
    expect(message).toContain("DXA Labs");
    // The instruction must be "sign in", not "use a different address".
    expect(message).toContain("サインイン");
  });

  it("never reveals whether an account exists", () => {
    // auth/user-not-found must fall through to the generic message; a
    // dedicated one would confirm the address is unregistered.
    const notFound = authErrorMessage({ code: "auth/user-not-found" });
    const unknown = authErrorMessage({ code: "auth/some-unmapped-code" });
    expect(notFound).toBe(unknown);
    expect(notFound).not.toContain("登録され");
  });

  it("falls back for a non-error value", () => {
    expect(authErrorMessage(null)).toBeTruthy();
    expect(authErrorMessage("boom")).toBeTruthy();
  });
});
