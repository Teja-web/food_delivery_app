import { and, eq, inArray } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { governanceRecords } from "@/db/schema/governance/records";
import { planArtifacts } from "@/db/schema/plan/plan-artifact";
import { getActionContext } from "@/lib/auth/context";
import { getCurrentUser } from "@/lib/auth/actions";
import { listPendingRecordsForUser } from "@/operations/governance/records";

import { InboxDecideButton } from "./InboxDecideButton";

export default async function GovernanceInboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getActionContext();
  const { currentUser } = await getCurrentUser();

  // Inbox = pending records assigned to me, scoped to this project.
  const userPending = currentUser ? await listPendingRecordsForUser(currentUser.id) : [];
  const records = userPending.filter((r) => r.projectId === id);

  // Also show all project-scoped pending records (governance dashboard view).
  const allPending = await db
    .select()
    .from(governanceRecords)
    .where(
      and(
        eq(governanceRecords.organizationId, ctx.organizationId),
        eq(governanceRecords.projectId, id),
        eq(governanceRecords.status, "pending"),
      ),
    );

  const planIds = Array.from(new Set(allPending.map((r) => r.planArtifactId)));
  const planTitles = new Map<string, { title: string; kind: string }>();
  if (planIds.length > 0) {
    const rows = await db
      .select({
        id: planArtifacts.id,
        title: planArtifacts.title,
        kind: planArtifacts.kind,
      })
      .from(planArtifacts)
      .where(inArray(planArtifacts.id, planIds));
    for (const r of rows) planTitles.set(r.id, { title: r.title, kind: r.kind });
  }

  const mineSet = new Set(records.map((r) => r.id));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pending governance records for this project.{" "}
          {records.length > 0 ? `${records.length} need your decision.` : ""}
        </p>
      </header>

      {allPending.length === 0 ? (
        <div className="rounded border bg-muted/20 p-6 text-sm text-muted-foreground">
          No pending records.
        </div>
      ) : (
        <ul className="divide-y rounded border text-sm">
          {allPending.map((r) => {
            const plan = planTitles.get(r.planArtifactId);
            const youDecide = mineSet.has(r.id);
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {r.kind}
                    </Badge>
                    {plan ? (
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {plan.kind}
                      </Badge>
                    ) : null}
                    {youDecide ? (
                      <Badge className="px-1.5 py-0 text-[10px] uppercase">
                        for you
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate">
                    <a
                      href={`/plans/${r.planArtifactId}`}
                      className="hover:underline"
                    >
                      {plan?.title ?? r.planArtifactId.slice(0, 12)}
                    </a>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    opened {new Date(r.createdAt).toLocaleString()}
                    {r.transitionFrom && r.transitionTo
                      ? ` · ${r.transitionFrom} → ${r.transitionTo}`
                      : ""}
                  </div>
                </div>
                {youDecide ? <InboxDecideButton recordId={r.id} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
