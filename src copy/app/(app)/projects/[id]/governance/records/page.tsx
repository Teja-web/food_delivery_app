import { and, desc, eq, inArray } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { governanceRecords } from "@/db/schema/governance/records";
import { projectTasks } from "@/db/schema/plan/project-task";
import { getActionContext } from "@/lib/auth/context";

export default async function GovernanceRecordsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getActionContext();

  const records = await db
    .select()
    .from(governanceRecords)
    .where(
      and(
        eq(governanceRecords.organizationId, ctx.organizationId),
        eq(governanceRecords.projectId, id),
      ),
    )
    .orderBy(desc(governanceRecords.createdAt))
    .limit(200);

  const planIds = Array.from(new Set(records.map((r) => r.projectTaskId)));
  const planTitles = new Map<string, string>();
  if (planIds.length > 0) {
    const rows = await db
      .select({ id: projectTasks.id, title: projectTasks.title })
      .from(projectTasks)
      .where(inArray(projectTasks.id, planIds));
    for (const r of rows) planTitles.set(r.id, r.title);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Full audit list of governance records for this project.
      </p>

      {records.length === 0 ? (
        <div className="rounded border bg-muted/20 p-6 text-sm text-muted-foreground">
          No records yet.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Policy hash</th>
              <th className="px-3 py-2 font-medium">Decided by</th>
              <th className="px-3 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-b hover:bg-muted/30">
                <td className="px-3 py-2">
                  <a
                    href={`/plans/${r.projectTaskId}`}
                    className="hover:underline"
                  >
                    {planTitles.get(r.projectTaskId) ?? r.projectTaskId.slice(0, 12)}
                  </a>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {r.kind}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {r.status}
                  </Badge>
                </td>
                <td
                  className="px-3 py-2 font-mono text-[10px] text-muted-foreground"
                  title={r.policySnapshot?.hash ?? "no snapshot"}
                >
                  {r.policySnapshot?.hash?.slice(0, 12) ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.decidedByName ?? r.decidedById ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  {new Date(r.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
