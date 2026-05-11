import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/actions/projects";
import { advanceProjectPhase, UnmetGatesError } from "@/actions/project-phase";
import { listGatesForPhase } from "@/actions/phase-gates";
import { listPlansByProject } from "@/operations/plans";
import { canAdvanceFrom, nextPhase } from "@/domain/phases";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function advance(id: string) {
  "use server";
  try {
    await advanceProjectPhase(id);
  } catch (err) {
    if (err instanceof UnmetGatesError) {
      // Surface the failure via the URL so the user sees what's blocking.
      const names = err.unmet.map((g) => g.name).join(", ");
      throw new Error(`Cannot advance: ${names} not passed`);
    }
    throw err;
  }
}

const GATE_BADGE: Record<string, string> = {
  pending: "text-yellow-600",
  passed: "text-green-600",
  failed: "text-red-600",
  skipped: "text-muted-foreground",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [plans, gates] = await Promise.all([
    listPlansByProject(id, { limit: 50 }),
    listGatesForPhase(id, project.phase),
  ]);
  const next = nextPhase(project.phase);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{project.slug}</div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          {project.description ? (
            <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {canAdvanceFrom(project.phase) ? (
            <form action={advance.bind(null, id)}>
              <Button type="submit" variant="outline">
                Advance to {next}
              </Button>
            </form>
          ) : null}
          <Button asChild>
            <Link href={`/plans/new?projectId=${id}`}>New plan</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Phase</CardTitle>
          </CardHeader>
          <CardContent className="text-xl capitalize">{project.phase}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent className="text-xl capitalize">{project.status}</CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">
          Phase gates <span className="text-sm text-muted-foreground">({project.phase})</span>
        </h2>
        {gates.length === 0 ? (
          <div className="rounded border bg-muted/30 p-4 text-sm text-muted-foreground">
            No gates configured for this phase. The phase can advance without any checks.
          </div>
        ) : (
          <ul className="divide-y rounded border text-sm">
            {gates.map((g) => (
              <li key={g.id} className="flex items-center justify-between px-4 py-2">
                <div>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{g.type}</div>
                </div>
                <span className={`capitalize ${GATE_BADGE[g.status] ?? ""}`}>{g.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Plans</h2>
        {plans.length === 0 ? (
          <div className="rounded border bg-muted/30 p-6 text-sm text-muted-foreground">
            No plans yet for this project.
          </div>
        ) : (
          <ul className="divide-y rounded border">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <Link href={`/plans/${p.id}`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {p.kind} · {p.status}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
