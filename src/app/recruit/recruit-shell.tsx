"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardCheck,
  HandCoins,
  LogOut,
  Search,
  Settings,
  Sun,
  UserSearch,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AskPanelProvider } from "@/components/shared/ask-ai-panel";
import { CommandPalette } from "@/components/shared/command-palette";
import { TourShell } from "@/components/tours";
import { tours } from "@/tours";
import { getPendingToursAction, updateTourProgressAction } from "@/actions/tours";
import { SSEProvider } from "@/hooks/use-entity-event";
import { authClient, signOut, useSession } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const NAV_BASE = [
  { href: "/recruit/today", icon: Sun, label: "Today", tourId: "tour-sidebar-today" },
  { href: "/recruit/roles", icon: Briefcase, label: "Open Roles", tourId: "tour-sidebar-roles" },
  { href: "/recruit/candidates", icon: UserSearch, label: "Candidates", tourId: "tour-sidebar-candidates" },
  { href: "/recruit/interviews", icon: CalendarClock, label: "Interviews", tourId: "tour-sidebar-interviews" },
  { href: "/recruit/offers", icon: HandCoins, label: "Offers", tourId: "tour-sidebar-offers", standardOnly: true },
] as const;

const SECONDARY = [
  { href: "/recruit/pools", icon: Users, label: "Talent Pools", disabled: false, tourId: "tour-sidebar-pools" },
  { href: "/recruit/assessments", icon: ClipboardCheck, label: "Assessments", disabled: false, tourId: "tour-sidebar-assessments" },
  { href: "/recruit/insights", icon: BarChart3, label: "Insights", disabled: false, tourId: "tour-sidebar-insights" },
  { href: "/recruit/settings", icon: Settings, label: "Settings", disabled: false, tourId: "tour-sidebar-settings" },
];

/* -- Layout ---------------------------------------------------------- */

interface Organization {
  id: string;
  name: string;
  slug?: string | null;
  logo?: string | null;
}

export function RecruitShell({
  children,
  orgType = "standard",
  role = "member",
}: {
  children: React.ReactNode;
  orgType?: "standard" | "vendor";
  role?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const NAV = NAV_BASE.filter((item) => !("standardOnly" in item) || orgType !== "vendor");
  // Vendor admins manage their own org via better-auth; the bespoke "Vendors"
  // settings page is only meaningful for hiring orgs.
  const showVendorSettingsLink = orgType === "standard" && (role === "owner" || role === "admin");
  void showVendorSettingsLink; // referenced where SECONDARY is rendered
  const { data: session, isPending, refetch } = useSession();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/auth/sign-in");
    }
  }, [isPending, session, router]);

  // Fetch organizations
  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      try {
        const result = await authClient.organization.list();
        if (result.data) {
          setOrganizations(result.data as Organization[]);
        }
      } catch {
        // Non-blocking
      }
    })();
  }, [session?.user]);

  // Get active org from session
  useEffect(() => {
    if (session?.session) {
      setActiveOrganizationId((session.session as any).activeOrganizationId || null);
    }
  }, [session?.session]);

  // Cmd+K handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSwitchOrganization = useCallback(async (orgId: string) => {
    try {
      await authClient.organization.setActive({ organizationId: orgId });
      window.location.href = "/recruit/today";
    } catch (error) {
      console.error("Failed to switch organization:", error);
    }
  }, []);

  const handleSignOut = async () => {
    await signOut();
    window.location.replace("/auth/sign-in");
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const activeOrg =
    organizations.find((org) => org.id === activeOrganizationId) ||
    organizations[0];

  if (isPending || !session?.user) {
    return null;
  }

  const user = session.user;

  // Reports pages are fullscreen — no sidebar or header
  const isReportsPage = pathname.startsWith("/recruit/reports");

  if (isReportsPage) {
    return (
      <SSEProvider>
        <AskPanelProvider>
          <div className="h-dvh bg-background overflow-auto">
            {children}
          </div>
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} orgId={activeOrganizationId} />
        </AskPanelProvider>
      </SSEProvider>
    );
  }

  return (
    <SSEProvider>
    <AskPanelProvider>
    <TourShell
      tours={tours}
      getPendingTours={getPendingToursAction}
      onTourComplete={(tourId) => updateTourProgressAction(tourId, "completed")}
      onTourSkip={(tourId, step) => updateTourProgressAction(tourId, "skipped", step)}
      onStepChange={(tourId, step) => updateTourProgressAction(tourId, "pending", step)}
    >
    <div className="flex h-dvh bg-background">
      {/* Sidebar — full height */}
      <aside className="w-56 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col overflow-hidden print:hidden">
        {/* Branding */}
        <div className="px-4 pt-4 pb-3">
          <Link href="/recruit/today" className="flex items-center gap-2 group">
            <img src="/logo.svg" alt="Dilliznt" className="h-8 w-8 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground">Dilliznt</p>
              <p className="text-[10px] uppercase tracking-widest text-amber-400">Talent Intelligence</p>
            </div>
          </Link>
        </div>

        <div className="mx-3 border-t border-sidebar-border" />

        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          <p className="text-[9px] uppercase tracking-[0.2em] font-semibold text-sidebar-foreground/60 px-3 mb-1.5">
            Hiring
          </p>
          <div className="space-y-0.5">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  id={item.tourId}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/60 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50",
                  )}
                >
                  <item.icon className={cn("h-4 w-4 shrink-0", active && "text-sidebar-primary")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mx-3 my-4 border-t border-sidebar-border" />

          <p className="text-[9px] uppercase tracking-[0.2em] font-semibold text-sidebar-foreground/60 px-3 mb-1.5">
            Configure
          </p>
          <div className="space-y-0.5">
            {SECONDARY.map((item) => {
              if (item.disabled) {
                return (
                  <span
                    key={item.label}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/30 cursor-not-allowed"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                );
              }
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.label}
                  id={item.tourId}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/60 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50",
                  )}
                >
                  <item.icon className={cn("h-4 w-4 shrink-0", active && "text-sidebar-primary")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Right: Header + Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
      <header className="h-14 border-b border-border bg-background flex items-center px-4 gap-4 shrink-0 print:hidden">
        {/* Left: Org Picker */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {organizations.length > 0 && (
            <DropdownMenu open={orgDropdownOpen} onOpenChange={setOrgDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-sm font-medium gap-2 hover:bg-transparent max-w-[200px]"
                >
                  <div className="h-5 w-5 rounded bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center shrink-0">
                    {activeOrg?.name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <span className="truncate">{activeOrg?.name || "Select Organization"}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {organizations.map((org) => (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => {
                      if (org.id !== activeOrganizationId) {
                        handleSwitchOrganization(org.id);
                      }
                      setOrgDropdownOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <div className="flex w-full items-center gap-2">
                      <div className="h-5 w-5 rounded bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center shrink-0">
                        {org.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 truncate">{org.name}</span>
                      {org.id === activeOrganizationId && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Center: Search */}
        <div className="flex-1 flex justify-center">
          <div className="w-full max-w-md">
            <Button
              id="tour-search"
              variant="outline"
              className="w-full justify-start text-sm text-muted-foreground h-8 bg-muted/40 border-border/50 hover:bg-muted/60 hover:border-border gap-2 rounded-md"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left truncate">
                Search, navigate, or ask AI...
              </span>
              <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                &#8984;K
              </kbd>
            </Button>
          </div>
        </div>

        {/* Right: User Profile */}
        <div className="flex items-center gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 h-8">
                <Avatar size="sm">
                  {mounted && user?.image && (
                    <AvatarImage src={user.image} alt={user?.name || ""} />
                  )}
                  <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                    {mounted && user?.name ? getInitials(user.name) : ""}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm hidden sm:inline">
                  {mounted ? user?.name || "User" : ""}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">
                    {mounted ? user?.name || "User" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mounted ? user?.email || "" : ""}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

        {/* Main content */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} orgId={activeOrganizationId} />
    </div>
    </TourShell>
    </AskPanelProvider>
    </SSEProvider>
  );
}
