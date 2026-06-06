import { Badge } from "@/components/ui/badge";
import { queryAuditLog } from "@/operations/audit/audit";

export default async function GovernanceAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // 30-day window of governance/approval-ish events.
  const to = new Date();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const all = await queryAuditLog({ scope: "all", from, to, limit: 300 });
  // Filter to this project.
  const rows = all.filter((r) => r.projectId === id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Audit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chronological state transitions on this project's governance + outcome ledger.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded border bg-muted/20 p-6 text-sm text-muted-foreground">
          No audit events in the last 30 days.
        </div>
      ) : (
        <ul className="divide-y rounded border text-sm">
          {rows.slice(0, 200).map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {r.entityType}
                  </Badge>
                  <span className="text-xs font-mono uppercase text-muted-foreground">
                    {r.action}
                  </span>
                  {r.verdict ? (
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {r.verdict}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate">
                  {r.summary ?? r.entityLabel ?? r.entityId.slice(0, 12)}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {r.actorName ?? r.actorType} ·{" "}
                  {new Date(r.occurredAt).toLocaleString()} ·{" "}
                  <code className="font-mono">{r.signature}</code>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
