"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_TABS = [
  { href: "", label: "Overview" },
  { href: "/interviews", label: "Interviews" },
  { href: "/results", label: "Results" },
];

export function RoleTabNav({ baseHref, hasOffer }: { baseHref: string; hasOffer?: boolean }) {
  const pathname = usePathname();
  const tabs = hasOffer ? [...BASE_TABS, { href: "/offer", label: "Offer" }] : BASE_TABS;

  return (
    <nav className="flex gap-1 border-b border-border px-1">
      {tabs.map((tab) => {
        const tabHref = `${baseHref}${tab.href}`;
        const active =
          tab.href === ""
            ? pathname === baseHref
            : pathname.startsWith(tabHref);

        return (
          <Link
            key={tab.label}
            href={tabHref}
            className={`relative px-3 py-2 text-xs font-medium transition-colors ${
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {active && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
