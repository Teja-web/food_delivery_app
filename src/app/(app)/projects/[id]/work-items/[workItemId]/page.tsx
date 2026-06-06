import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";

import { db } from "@/db/client";
import { workItems } from "@/db/schema/work-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getActionContext } from "@/lib/auth/context";

export default async function WorkItemDetailPage({
  params,
}: {
  params: Promise<{ id: string; workItemId: string }>;
}) {
  const { id: projectId, workItemId } = await params;
  const ctx = await getActionContext();

  const item = await db.query.workItems.findFirst({
    where: and(
      eq(workItems.id, workItemId),
      eq(workItems.organizationId, ctx.organizationId),
    ),
  });
  if (!item || item.projectId !== projectId) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1 border-b pb-4">
        <Link
          href={`/projects/${projectId}/work-items`}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Work items
        </Link>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="text-[10px] capitalize">
            {item.kind ?? item.source}
          </Badge>
          {item.status && (
            <span className="text-muted-foreground capitalize">{item.status}</span>
          )}
          {item.aiAuthored && (
            <Badge variant="outline" className="border-purple-500/40 text-[10px] text-purple-500">
              AI authored
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-semibold">{item.title}</h1>
        <p className="text-[11px] text-muted-foreground">
          {item.source} · {item.externalId}
          {item.assigneeEmail ? ` · ${item.assigneeEmail}` : ""}
        </p>
        {item.externalUrl && (
          <div className="pt-2">
            <Button asChild variant="outline" size="sm">
              <a href={item.externalUrl} target="_blank" rel="noreferrer">
                View on {item.source} <ExternalLink className="ml-1 h-3 w-3" aria-hidden />
              </a>
            </Button>
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Description
            </h2>
            {item.description ? (
              <article className="prose prose-sm dark:prose-invert max-w-none rounded border bg-muted/20 p-4 whitespace-pre-wrap">
                {item.description}
              </article>
            ) : (
              <p className="text-sm text-muted-foreground">No description.</p>
            )}
          </section>
        </div>

        <aside className="space-y-3 text-xs">
          {item.planArtifactId && (
            <RailSection title="Linked plan">
              <Link
                href={`/plans/${item.planArtifactId}`}
                className="hover:underline"
              >
                {item.planArtifactId}
              </Link>
            </RailSection>
          )}
          <RailSection title="Last synced">
            {item.lastSyncedAt
              ? new Date(item.lastSyncedAt).toLocaleString()
              : "—"}
          </RailSection>
          <RailSection title="Created">
            {new Date(item.createdAt).toLocaleString()}
          </RailSection>
        </aside>
      </div>
    </div>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div>{children}</div>
    </div>
  );
}
