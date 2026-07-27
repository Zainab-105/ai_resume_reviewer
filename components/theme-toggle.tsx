"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

type Theme = "light" | "dark" | "system";

const order: Theme[] = ["system", "light", "dark"];
const icons = { system: Monitor, light: Sun, dark: Moon };

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage can throw in private-mode / blocked-cookie contexts.
  }
  return "system";
}

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  // Read from localStorage during initialisation rather than in an effect, so
  // the first client render already has the right value. The server render
  // can't see localStorage, so hydration is gated on `isClient` below.
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window === "undefined" ? "system" : readStoredTheme(),
  );

  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // Preference simply won't persist; the toggle still works this session.
    }
    apply(theme);

    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const Icon = icons[theme];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Theme: ${theme}. Click to change.`}
      onClick={() => setTheme(order[(order.indexOf(theme) + 1) % order.length])}
    >
      {isClient ? <Icon aria-hidden className="size-4" /> : <span className="size-4" />}
    </Button>
  );
}
