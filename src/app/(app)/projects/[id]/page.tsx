import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/actions/projects";
import { advanceProjectPhase } from "@/actions/project-phase";
import { listPlansByProject } from "@/operations/plans";
import { canAdvanceFrom, nextPhase } from "@/domain/phases";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function advance(id: string) {
  "use server";
  await advanceProjectPhase(id);
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const plans = await listPlansByProject(id, { limit: 50 });
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
