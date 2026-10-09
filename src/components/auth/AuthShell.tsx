"use client";

import { useRef, type ReactNode } from "react";
import AuthPanel from "@/components/auth/AuthPanel";
import LangToggle from "@/components/landing/LangToggle";
import "./auth-shell.css";

/**
 * The split shell shared by /login and /pending (the family majority, RECON
 * §3): the form half on the left, the abstract panel on the right, 50/50 from
 * 1080px, the panel removed below that. /forgot-password keeps its own single
 * column and does not use this.
 *
 * The form half holds, in DOM order: the screen's column, an optional corner
 * slot (/login's BUILD tag, bottom-left) and the JA | EN toggle (top-right).
 * The toggle is last so the first Tab lands on the form, and it reads and
 * writes the language only through the LanguageProvider (src/i18n/lang.ts).
 *
 * The shell is the panel's focus scope: focus anywhere in it pauses the
 * auto-advance.
 */
export default function AuthShell({ children, corner }: { children: ReactNode; corner?: ReactNode }) {
  const shell = useRef<HTMLElement>(null);
  return (
    <main ref={shell} data-auth-shell="">
      <section data-auth-form="">
        <div data-auth-column="">{children}</div>
        {corner}
        <div data-auth-toggle="">
          <LangToggle />
        </div>
      </section>
      <AuthPanel focusScope={shell} />
    </main>
  );
}
