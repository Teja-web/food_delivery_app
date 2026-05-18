/**
 * /settings/repos — per-repo trust policy listing.
 *
 * Three-state policy (read-write / read-only / deny) per canonical git
 * remote. Auto-created with `read-write` on first `coznt connect`;
 * operators tighten here.
 */

import { ChevronLeft, Globe2 } from "lucide-react";
import Link from "next/link";

import { listRepoPoliciesAction } from "@/actions/repo-policies";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { RepoPoliciesClient } from "./RepoPoliciesClient";

export default async function RepoPoliciesPage() {
  const rows = await listRepoPoliciesAction();

  return (
    <div className="max-w-5xl space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Settings
      </Link>

      <header>
        <h1 className="font-display text-2xl font-semibold">Repo trust policy</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Three-state policy per canonical git remote — collapses SSH and HTTPS variants of the
          same repo to a single key. Enforced at session-start: <code>deny</code> rejects the
          session; <code>read-only</code> blocks write verbs. Rows auto-create with{" "}
          <code>read-write</code> when a developer first runs <code>coznt connect</code>.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Globe2 className="h-3 w-3" aria-hidden />
                No repos seen yet
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            When a developer runs <code className="font-mono">coznt connect</code> from a repo,
            its canonical remote auto-registers here with policy{" "}
            <code className="font-mono">read-write</code>. Tighten to{" "}
            <code className="font-mono">read-only</code> or <code className="font-mono">deny</code>{" "}
            as needed.
          </CardContent>
        </Card>
      ) : (
        <RepoPoliciesClient
          rows={rows.map((r) => ({
            id: r.id,
            remoteCanonical: r.remoteCanonical,
            policy: r.policy,
            projectId: r.projectId,
            updatedAtIso: r.updatedAt.toISOString(),
            updatedByName: r.updatedByName,
          }))}
        />
      )}
    </div>
  );
}
