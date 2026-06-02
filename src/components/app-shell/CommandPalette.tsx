"use client";

import {
  Activity,
  FileCheck,
  FilePlus,
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
import { useEffect, useMemo, useState } from "react";

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
import { parseShortSyntax } from "@/lib/short-syntax/parser";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const NAV_ITEMS = [
  { label: "Projects", href: "/projects", Icon: FolderKanban, group: "Navigate" },
  { label: "Plans", href: "/plans", Icon: ScrollText, group: "Navigate" },
  { label: "Needs approval", href: "/plans?needs=approval", Icon: FileCheck, group: "Navigate" },
  { label: "Skills", href: "/skills", Icon: Sparkles, group: "Navigate" },
  { label: "Rules", href: "/rules", Icon: Shield, group: "Navigate" },
  { label: "Adapters", href: "/integrations", Icon: Plug, group: "Navigate" },
  { label: "DORA metrics", href: "/metrics", Icon: Activity, group: "Navigate" },
  { label: "Audit log", href: "/audit", Icon: FileCheck, group: "Navigate" },
  { label: "Settings", href: "/settings", Icon: Settings, group: "Navigate" },
  { label: "API keys", href: "/api-keys", Icon: Key, group: "Navigate" },
] as const;

export function CommandPalette({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const jump = (href: string) => {
    onOpenChange(false);
    setSearch("");
    router.push(href);
  };

  // C11 quick-add: short-syntax sigils in the search input flip the
  // palette into "create a plan" mode. Empty parse → nothing shown.
  const parsed = useMemo(() => parseShortSyntax(search), [search]);
  const showQuickAdd =
    search.trim().length > 0 &&
    (parsed.kind !== undefined ||
      parsed.projectSlug !== undefined ||
      parsed.approvalTarget !== undefined ||
      parsed.estimateMinutes !== undefined ||
      parsed.dueDate !== undefined);
  const quickAddPreview = [
    parsed.title || "(no title)",
    parsed.kind ? `#${parsed.kind}` : null,
    parsed.projectSlug ? `+${parsed.projectSlug}` : null,
    parsed.dueDate ? `@${parsed.dueDate}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Type a page name or short-syntax: fix bug #spec +payments 2h"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        {showQuickAdd && (
          <>
            <CommandGroup heading="Quick add">
              <CommandItem
                value={`create plan ${search}`}
                onSelect={() => {
                  jump(`/plans/new?shortSyntax=${encodeURIComponent(search)}`);
                }}
              >
                <FilePlus className="h-4 w-4" aria-hidden />
                <span className="flex-1 truncate">Create plan: {quickAddPreview}</span>
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
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
