"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Building2, Calendar, Fingerprint, Handshake, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { seedTourForUserAction } from "@/actions/tours";

const TABS = [
  { href: "/recruit/settings/team", icon: Users, label: "Team" },
  { href: "/recruit/settings/departments", icon: Building2, label: "Departments" },
  { href: "/recruit/settings/identity", icon: Fingerprint, label: "Identity" },
  { href: "/recruit/settings/integrations", icon: Calendar, label: "Integrations" },
  { href: "/recruit/settings/vendors", icon: Handshake, label: "Vendors" },
  { href: "/recruit/settings/automations", icon: Bot, label: "Automations" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const seeded = useRef(false);

  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      seedTourForUserAction("settings-setup").catch(() => {});
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      <nav id="tour-settings-nav" className="shrink-0 border-b border-border px-6 flex items-center gap-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm transition-all duration-150 border-b-2 -mb-px",
                active
                  ? "border-foreground text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50",
              )}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
