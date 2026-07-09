"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { slug: "general", label: "General" },
  { slug: "repositories", label: "Sources" },
  { slug: "environments", label: "Environments" },
  { slug: "governance-policies", label: "Governance policies" },
  { slug: "members", label: "Members" },
  { slug: "api-keys", label: "API keys" },
  { slug: "danger-zone", label: "Danger zone" },
];

export function SettingsNav({ projectId }: { projectId: string }) {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Settings sections" className="space-y-0.5">
      {ITEMS.map((item) => {
        const href = `/projects/${projectId}/settings/${item.slug}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={item.slug}
            href={href}
            className={cn(
              "block rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              item.slug === "danger-zone" && "text-red-500/80",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
