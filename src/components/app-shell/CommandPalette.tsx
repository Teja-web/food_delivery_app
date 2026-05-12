"use client";

import {
  Activity,
  CheckCircle2,
  FileCheck,
  FolderKanban,
  Key,
  Plug,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Sun,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const NAV_ITEMS = [
  { label: "Projects", href: "/projects", Icon: FolderKanban, group: "Navigate" },
  { label: "Plans", href: "/plans", Icon: ScrollText, group: "Navigate" },
  { label: "Approvals", href: "/approvals", Icon: CheckCircle2, group: "Navigate" },
  { label: "Skills", href: "/skills", Icon: Sparkles, group: "Navigate" },
  { label: "Rules", href: "/rules", Icon: Shield, group: "Navigate" },
  { label: "Adapters", href: "/integrations", Icon: Plug, group: "Navigate" },
  { label: "DORA metrics", href: "/metrics", Icon: Activity, group: "Navigate" },
  { label: "Audit log", href: "/skills/audit", Icon: FileCheck, group: "Navigate" },
  { label: "Settings", href: "/settings", Icon: Settings, group: "Navigate" },
  { label: "API keys", href: "/api-keys", Icon: Key, group: "Navigate" },
] as const;

export function CommandPalette({ open, onOpenChange }: Props) {
  const router = useRouter();

  const jump = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or page name…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.label} ${item.href}`}
              onSelect={() => jump(item.href)}
            >
              <item.Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="toggle theme"
            onSelect={() => {
              const current = document.documentElement.getAttribute("data-theme");
              const next = current === "light" ? "dark" : "light";
              document.documentElement.setAttribute("data-theme", next);
              try {
                window.localStorage.setItem("coznt:theme", next);
              } catch {
                /* noop */
              }
              onOpenChange(false);
            }}
          >
            <Sun className="h-4 w-4" aria-hidden />
            Toggle theme
          </CommandItem>
          <CommandItem value="new project" onSelect={() => jump("/projects/new")}>
            <FolderKanban className="h-4 w-4" aria-hidden />
            New project
            <CommandShortcut>↵</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Hook that wires Cmd+K / Ctrl+K to toggle a palette state. */
export function useCommandPaletteShortcut(setOpen: (next: boolean | ((prev: boolean) => boolean)) => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isShortcut) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);
}
