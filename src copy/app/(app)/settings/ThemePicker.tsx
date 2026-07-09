"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type Theme = "dark" | "light";
const STORAGE_KEY = "coznt:theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Moon }[] = [
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "light", label: "Light", Icon: Sun },
];

export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setTheme(stored === "light" ? "light" : "dark");
    setMounted(true);
  }, []);

  const pick = (next: Theme) => {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((o) => {
        const active = mounted && theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => pick(o.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            aria-pressed={active}
          >
            <o.Icon className="h-3.5 w-3.5" aria-hidden />
            {o.label}
          </button>
        );
      })}
      <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Monitor className="h-3.5 w-3.5" aria-hidden /> System sync not yet wired
      </div>
    </div>
  );
}
