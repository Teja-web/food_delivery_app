import { eq } from "drizzle-orm";
import { Bell, Building2, Keyboard, LinkIcon, ShieldCheck, User as UserIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { organization } from "@/db/schema/auth";
import { getCurrentUser } from "@/lib/auth/actions";

import { ThemePicker } from "./ThemePicker";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default async function SettingsPage() {
  const { currentUser, organizationId, role } = await getCurrentUser();
  const org = organizationId
    ? await db
        .select()
        .from(organization)
        .where(eq(organization.id, organizationId))
        .limit(1)
        .then((rows) => rows[0])
    : undefined;

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personal preferences and workspace context. Org-level admin lives in a separate surface.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <UserIcon className="h-3 w-3" aria-hidden />
              Profile
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentUser ? (
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-sidebar-accent-foreground">
                {initials(currentUser.name || currentUser.email)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{currentUser.name || "—"}</div>
                <div className="truncate text-xs text-muted-foreground">{currentUser.email}</div>
              </div>
              <Badge
                variant="outline"
                className="border-foreground/20 bg-foreground/5 font-mono text-[10px] uppercase tracking-[0.06em]"
              >
                {roleLabel(role)}
              </Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not signed in.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Building2 className="h-3 w-3" aria-hidden />
              Workspace
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {org ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{org.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {org.slug ?? org.id.slice(0, 8)}
                  </div>
                  {org.description ? (
                    <p className="mt-1 text-xs text-muted-foreground/85">{org.description}</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                  {org.type ?? "standard"}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 border-t border-border/40 pt-3 text-xs">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Industry
                  </dt>
                  <dd className="mt-0.5 text-foreground/85">{org.industry ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Size
                  </dt>
                  <dd className="mt-0.5 text-foreground/85">{org.size ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Location
                  </dt>
                  <dd className="mt-0.5 text-foreground/85">{org.location ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Website
                  </dt>
                  <dd className="mt-0.5 text-foreground/85">
                    {org.website ? (
                      <a
                        href={org.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {org.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active workspace.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            Theme — persists in <span className="font-mono text-foreground">localStorage</span>.
          </div>
          <ThemePicker />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Bell className="h-3 w-3" aria-hidden />
              Notifications
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <div>Approval requests</div>
              <div className="text-xs text-muted-foreground">When you are listed as an approver.</div>
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              email · in-app
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div>DORA regressions</div>
              <div className="text-xs text-muted-foreground">When change-failure rate spikes on a project you watch.</div>
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              in-app
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div>Skill autonomy changes</div>
              <div className="text-xs text-muted-foreground">Promotions and demotions on skills in your projects.</div>
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              in-app
            </Badge>
          </div>
          <p className="pt-2 text-[11px] text-muted-foreground">
            Per-channel granular control is on the roadmap.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <LinkIcon className="h-3 w-3" aria-hidden />
              Linked surfaces
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <div>Adapters</div>
              <div className="text-xs text-muted-foreground">GitHub, Jira, ADO, Confluence credentials.</div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/integrations">Open</Link>
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div>API keys</div>
              <div className="text-xs text-muted-foreground">Bearer tokens for the <code>/api/v1</code> agent surface.</div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/api-keys">Open</Link>
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div>Tool discipline</div>
              <div className="text-xs text-muted-foreground">Which MCP verbs are allowed in which phase. Platform-declared, read-only.</div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/policy">Open</Link>
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div>Repo trust policy</div>
              <div className="text-xs text-muted-foreground">Per-repo three-state policy (read-write / read-only / deny). Auto-registers when a dev runs <code>coznt connect</code>.</div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/repos">Open</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Keyboard className="h-3 w-3" aria-hidden />
              Shortcuts
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span>Open command palette</span>
            <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">⌘ K</kbd>
          </div>
          <div className="flex items-center justify-between">
            <span>Go to portfolio</span>
            <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">g p</kbd>
          </div>
          <p className="pt-1 text-[11px] text-muted-foreground">
            Additional bindings are added per moment in the build plan.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              Audit & compliance
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">
            Every state change is recorded. Run parameterized queries and export reproducible CSV/JSON (every row carries a deterministic hash of its fields).
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/audit">Open audit log</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
