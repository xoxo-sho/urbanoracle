"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

// The theme preference lives outside React (localStorage + matchMedia), so it
// is read through useSyncExternalStore rather than copied into state from an
// effect. The server snapshot is always light, matching the prerendered HTML;
// after hydration React re-reads the real preference and re-renders.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  const stored = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return stored === "dark" || (!stored && prefersDark);
}

function getServerSnapshot(): boolean {
  return false;
}

function setStoredTheme(next: boolean) {
  localStorage.setItem("theme", next ? "dark" : "light");
  listeners.forEach((l) => l());
}

export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const toggle = () => setStoredTheme(!dark);

  return (
    <button
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-accent cursor-pointer"
      title={dark ? "ライトモードに切替" : "ダークモードに切替"}
    >
      {dark ? (
        <Sun className="h-4 w-4 text-muted-foreground" />
      ) : (
        <Moon className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}
