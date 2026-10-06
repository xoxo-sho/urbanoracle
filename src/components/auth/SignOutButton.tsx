"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { firebaseAuth } from "@/lib/firebase";

/**
 * Signed-in identity and the way out of it — the platform's sign-out pattern
 * (Landcast UserMenu, DisasterShield RequireAuth, PropScore Layout): the
 * e-mail beside a 「サインアウト」 control, Firebase signOut on the app's own
 * auth instance, then the product's sign-in route.
 *
 * Renders nothing without a session. /app shows sample data to anyone, so
 * this control is the only on-screen difference between a session and no
 * session; drawing it for an anonymous visitor would claim one exists.
 *
 * Navigation is explicit, with replace: nothing gates /app on the client, so
 * without it the sample dashboard would stay on screen looking exactly like
 * the session that just ended — and Back must not return to that view either.
 *
 * On failure the user is still signed in, so the control stays as it was.
 * Pretending otherwise on a shared machine is the one outcome this must not
 * produce.
 */
export default function SignOutButton() {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut(firebaseAuth());
    } catch {
      setBusy(false);
      return;
    }
    router.replace("/login");
  };

  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="account-bar">
      {user.email && (
        <span
          className="max-w-[9rem] truncate text-[11px] tabular-nums text-muted-foreground md:max-w-[14rem]"
          title={user.email}
        >
          {user.email}
        </span>
      )}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={busy}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
        サインアウト
      </button>
    </div>
  );
}
