"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { slug: "inbox", label: "Inbox" },
  { slug: "policies", label: "Policies" },
  { slug: "records", label: "Records" },
  { slug: "verification-debt", label: "Verification debt" },
  { slug: "audit", label: "Audit" },
  { slug: "skills", label: "Skills" },
];

export function GovernanceNav({ projectId }: { projectId: string }) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Governance subsections"
      className="flex items-center gap-1 border-b"
    >
      {ITEMS.map((item) => {
        const href = `/projects/${projectId}/governance/${item.slug}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={item.slug}
            href={href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
