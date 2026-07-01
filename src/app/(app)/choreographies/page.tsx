/**
 * /choreographies — list of customer-authored choreographies for the org.
 *
 * Shows org-wide + project-scoped rows in one table. Platform-shipped
 * choreographies live alongside skills in the `/skills` catalog; this
 * page is exclusively for rows authored by operators in coznt's UI and
 * pushed to dev repos via `coznt sync`.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { ChevronLeft, Plus, Workflow } from "lucide-react";
import Link from "next/link";

import { db } from "@/db/client";
import { customChoreographies } from "@/db/schema/custom-choreography";
import { type Project, projects } from "@/db/schema/project";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActionContext } from "@/lib/auth/context";

export default async function ChoreographiesPage() {
  const ctx = await getActionContext();

  const rows = await db
    .select()
    .from(customChoreographies)
    .where(
      and(
        eq(customChoreographies.organizationId, ctx.organizationId),
        isNull(customChoreographies.deletedAt),
      ),
    )
    .orderBy(desc(customChoreographies.updatedAt));

  const allProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.organizationId, ctx.organizationId));
  const projectsById = new Map<string, Project>(allProjects.map((p) => [p.id, p]));

  return (
    <div className="max-w-6xl space-y-6">
      <Link
        href="/skills"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Skills
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Custom choreographies</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Workflow guides your team authored — checked in to <code>.agents/skills/custom/</code> in
            your repo and applied on PR merge. Platform-shipped choreographies surface through the
            CLAUDE.md / AGENTS.md claim + MCP tool descriptions; no files are pushed to your repo.
          </p>
        </div>
        <Button asChild>
          <Link href="/choreographies/new" className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden /> New choreography
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Workflow className="h-3 w-3" aria-hidden />
                Nothing here yet
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Start by authoring a workflow guide for one of your projects, or org-wide. The body
            is YAML frontmatter + Markdown — same format as platform choreographies.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Scope</th>
                  <th className="px-4 py-3 font-medium">Version</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const scopeLabel = r.projectId
                    ? projectsById.get(r.projectId)?.name ?? "project"
                    : "org-wide";
                  return (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3 font-mono text-xs">{r.slug}</td>
                      <td className="px-4 py-3">{r.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{scopeLabel}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.version}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.updatedAt.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.updatedByName ?? r.createdByName ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
