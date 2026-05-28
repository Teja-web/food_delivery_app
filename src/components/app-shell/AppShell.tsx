"use client";

import {
  Activity,
  Bell,
  CheckCircle2,
  FileCheck,
  FolderKanban,
  Key,
  LogOut,
  Plug,
  Plus,
  Rocket,
  ScrollText,
  Search,
  Settings,
  Shield,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { CommandPalette, useCommandPaletteShortcut } from "@/components/app-shell/CommandPalette";
import { ThemeToggle } from "@/components/app-shell/ThemeToggle";
import { Logo } from "@/components/marketing/Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof Activity;
  matchPrefix?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const GROUPS: NavGroup[] = [
  {
    label: "Plan",
    items: [
      { href: "/projects", label: "Projects", Icon: FolderKanban, matchPrefix: "/projects" },
      { href: "/plans", label: "Plans", Icon: ScrollText, matchPrefix: "/plans" },
      { href: "/releases", label: "Releases", Icon: Rocket, matchPrefix: "/releases" },
      { href: "/approvals", label: "Approvals", Icon: CheckCircle2 },
    ],
  },
  {
    label: "Insight",
    items: [
      { href: "/skills", label: "Skills", Icon: Sparkles, matchPrefix: "/skills" },
      { href: "/metrics", label: "DORA", Icon: Activity },
      { href: "/audit", label: "Audit log", Icon: FileCheck },
    ],
  },
  {
    label: "Runtime",
    items: [
      { href: "/integrations", label: "Adapters", Icon: Plug },
    ],
  },
];

const SECTION_LABELS: Record<string, string> = {
  "/projects": "Portfolio",
  "/plans": "Plans",
  "/approvals": "Approvals",
  "/skills": "Skills",
  "/audit": "Audit log",
  "/rules": "Rules",
  "/choreographies": "Choreographies",
  "/integrations": "Adapters",
  "/metrics": "DORA metrics",
  "/settings": "Settings",
  "/api-keys": "API keys",
  "/playground": "Playground",
  "/releases": "Releases",
  "/notifications": "Notifications",
};

function deriveSectionLabel(pathname: string): string {
  if (SECTION_LABELS[pathname]) return SECTION_LABELS[pathname];
  // /projects/<id> -> "Project"; /plans/<id> -> "Plan"; /skills/<id> -> "Skill"
  const seg = pathname.split("/").filter(Boolean);
  if (seg[0] === "projects" && seg[1]) return "Project";
  if (seg[0] === "plans" && seg[1]) return "Plan";
  if (seg[0] === "skills" && seg[1]) return "Skill";
  return SECTION_LABELS[`/${seg[0] ?? ""}`] ?? "Workspace";
}

function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  if (item.matchPrefix && pathname.startsWith(`${item.matchPrefix}/`)) {
    return true;
  }
  return false;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

type Props = {
  user: { name: string; email: string };
  role: string;
  orgName: string;
  children: React.ReactNode;
};

export function AppShell({ user, role, orgName, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const section = deriveSectionLabel(pathname);
  const showNewProject = pathname === "/projects";
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteShortcut(setPaletteOpen);

  const handleSignOut = async () => {
    await signOut();
    router.push("/auth/sign-in");
  };

  return (
    <div className="grid h-dvh grid-cols-[224px_1fr] bg-background text-foreground">
      <aside className="flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <Link href="/projects" className="flex items-center gap-2.5 px-5 pt-5 pb-6">
          <Logo className="h-8 w-8 shrink-0" />
          <div className="min-w-0 leading-tight">
            <div className="font-display text-[15px] font-bold tracking-tight text-sidebar-accent-foreground">
              Coznt
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-amber-400">
              AIDLC Governed
            </div>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-5">
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">
                {g.label}
              </div>
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors duration-[var(--motion-short)]",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/85 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <item.Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-background/95 px-8 py-3 backdrop-blur">
          <nav aria-label="Breadcrumb" className="min-w-0 truncate text-sm">
            <span className="text-muted-foreground">{orgName}</span>
            <span className="px-2 text-muted-foreground/60">/</span>
            <span className="font-medium">{section}</span>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-input bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60"
              aria-label="Search"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              <span>Search</span>
              <span className="ml-2 hidden font-mono text-[10px] opacity-70 sm:inline">⌘K</span>
            </button>
            <ThemeToggle />
            {showNewProject ? (
              <Button asChild size="sm">
                <Link href="/projects/new">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  New project
                </Link>
              </Button>
            ) : null}
            <Link
              href="/notifications"
              aria-label="Notifications"
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                pathname === "/notifications" && "bg-muted/60 text-foreground",
              )}
            >
              <Bell className="h-4 w-4" aria-hidden />
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/70"
                >
                  {initials(user.name || user.email)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="leading-tight">
                    <div className="truncate text-[13px] font-medium">{user.name || user.email}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {role} · {orgName}
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="h-4 w-4" aria-hidden />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/api-keys">
                    <Key className="h-4 w-4" aria-hidden />
                    <span>API keys</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/rules">
                    <Shield className="h-4 w-4" aria-hidden />
                    <span>Rules</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleSignOut}>
                  <LogOut className="h-4 w-4" aria-hidden />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-auto px-8 py-6">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
