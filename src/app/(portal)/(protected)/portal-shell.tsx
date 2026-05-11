"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Calendar,
  ClipboardCheck,
  Compass,
  FileText,
  LogOut,
  MessageCircle,
  Settings,
  TrendingUp,
  User,
  type LucideIcon,
} from "lucide-react";
import { portalSignOut } from "@/actions/portal";
import { Button } from "@/components/ui/button";
import { usePortalCandidate } from "./portal-candidate-context";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: "exact" | "prefix";
}

const APPLY_NAV_BASE: NavItem[] = [
  { href: "/coach", label: "Coach", icon: MessageCircle, match: "exact" },
  { href: "/roles", label: "Roles", icon: Briefcase, match: "prefix" },
  { href: "/assessments", label: "Assessments", icon: ClipboardCheck, match: "prefix" },
  { href: "/interviews", label: "Interviews", icon: Calendar, match: "prefix" },
];

const EXPLORE_NAV: NavItem = {
  href: "/explore",
  label: "Explore",
  icon: Compass,
  match: "exact",
};

const TRACK_NAV: NavItem[] = [
  { href: "/pulse", label: "Pulse", icon: TrendingUp, match: "exact" },
  { href: "/offers", label: "Offers", icon: FileText, match: "prefix" },
  { href: "/profile", label: "Profile", icon: User, match: "prefix" },
];

function isActive(item: NavItem, pathname: string) {
  return item.match === "exact"
    ? pathname === item.href
    : pathname.startsWith(item.href);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
        active
          ? "bg-amber-500/15 text-amber-700"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{item.label}</span>
    </Link>
  );
}

export function PortalShell({
  children,
  initials,
  userName,
}: {
  children: React.ReactNode;
  initials: string;
  userName: string;
}) {
  const pathname = usePathname();
  const candidate = usePortalCandidate();
  const isStudent =
    candidate.kind === "student" || candidate.kind === "early_career";
  const APPLY_NAV: NavItem[] = isStudent
    ? [...APPLY_NAV_BASE, EXPLORE_NAV]
    : APPLY_NAV_BASE;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [dropdownOpen]);

  const onSettings = pathname.startsWith("/settings");

  return (
    <div className="flex h-dvh flex-col bg-[oklch(0.97_0.006_55)]">
      <header className="relative z-20 shrink-0 border-b border-stone-200/40 bg-white/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Dilliznt" className="h-7 w-7" />
            <div className="leading-tight">
              <div className="font-display text-sm font-semibold tracking-tight text-foreground">
                Dilliznt
              </div>
              <div className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Talent Intelligence
              </div>
            </div>
          </Link>

          <nav className="flex items-center gap-0.5">
            {APPLY_NAV.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item, pathname)} />
            ))}
            <span aria-hidden className="mx-2 h-5 w-px bg-stone-300" />
            {TRACK_NAV.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item, pathname)} />
            ))}
          </nav>

          {/* Avatar dropdown */}
          <div className="relative flex items-center gap-2" ref={dropdownRef}>
            <Button
              variant="unstyled"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold transition-all ${
                onSettings || dropdownOpen
                  ? "bg-amber-500 text-white ring-2 ring-amber-200"
                  : "bg-stone-800 text-white hover:bg-stone-700"
              }`}
            >
              {initials}
            </Button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
                {userName && (
                  <div className="border-b border-stone-100 px-4 py-2.5">
                    <p className="text-xs font-semibold text-stone-900">{userName}</p>
                  </div>
                )}
                <div className="py-1">
                  <Link
                    href="/settings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs text-stone-600 transition-colors hover:bg-stone-50"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Settings
                  </Link>
                </div>
                <div className="border-t border-stone-100 py-1">
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      setDropdownOpen(false);
                      await portalSignOut();
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-xs text-red-600 transition-colors hover:bg-red-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
