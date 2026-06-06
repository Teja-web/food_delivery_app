import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProject } from "@/actions/project/projects";
import type { Project } from "@/db/schema/project";
import { getActionContext } from "@/lib/auth/context";
import { computeProjectDebt } from "@/operations/verification-debt";

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        <div className="font-display text-3xl font-bold tabular-nums">
          {value.toFixed(2)}
        </div>
        {hint ? (
          <div className="font-mono text-[10px] text-muted-foreground">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function VerificationDebtPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  const ctx = await getActionContext();
  const breakdown = await computeProjectDebt(id, ctx.organizationId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Verification debt</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A composite score of skills below merge-level, aging governance, gate trips, and
          AI-authored changes without evidence. Lower is better.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Total" value={breakdown.total} hint="sum of below" />
        <Tile label="Autonomy" value={breakdown.fromAutonomy} hint="distance × invocations" />
        <Tile label="Open approvals" value={breakdown.fromOpenApprovals} hint="weighted age" />
        <Tile label="Gate trips" value={breakdown.fromGateTrips} hint="failure rate" />
        <Tile label="Unreviewed AI" value={breakdown.fromUnreviewed} hint="hours since authored" />
      </div>

      <p className="text-xs text-muted-foreground">
        Pure formula: <code>src/domain/verification-debt/score.ts</code>. Snapshots:{" "}
        <code>src/operations/verification-debt.ts</code>.
      </p>
    </div>
  );
}
