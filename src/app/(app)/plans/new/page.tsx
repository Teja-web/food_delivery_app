import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { planArtifacts as plans, PLAN_KINDS, PLAN_KIND_PARENTS, type PlanKind } from "@/db/schema/plan/plan-artifact";
import type { Project } from "@/db/schema/project";
import { createPlan } from "@/actions/plan/plans";
import { listProjects } from "@/actions/project/projects";
import { getCurrentUser } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

async function action(formData: FormData) {
  "use server";
  // Note: parent linkage now lives in plan_relationships (kind=parent_of).
  // The relationships row should be created post-insert from a dedicated
  // form; for the inline create flow we just create the artifact.
  const created = await createPlan({
    projectId: String(formData.get("projectId")),
    kind: String(formData.get("kind")) as PlanKind,
    title: String(formData.get("title") ?? "").trim(),
    summary: String(formData.get("summary") ?? "").trim() || undefined,
    body: String(formData.get("body") ?? ""),
  });
  redirect(`/plans/${created.id}`);
}

export default async function NewPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; kind?: PlanKind; parentPlanId?: string }>;
}) {
  const sp = await searchParams;
  const { items: projects } = (await listProjects({ limit: 100 })) as { items: Project[] };
  const selectedProjectId = sp.projectId ?? projects[0]?.id;

  const selectedKind = (sp.kind as PlanKind | undefined) ?? "story";
  const allowedParentKinds = PLAN_KIND_PARENTS[selectedKind] ?? [];

  const { organizationId } = await getCurrentUser();
  const parentOptions = selectedProjectId && organizationId && allowedParentKinds.length
    ? await db.query.planArtifacts.findMany({
        where: and(
          eq(plans.projectId, selectedProjectId),
          eq(plans.organizationId, organizationId),
          inArray(plans.kind, allowedParentKinds),
        ),
        columns: { id: true, title: true, kind: true },
        limit: 100,
      })
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">New plan</h1>
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="projectId">Project</Label>
          <select
            id="projectId"
            name="projectId"
            defaultValue={selectedProjectId}
            required
            className="h-9 w-full rounded border bg-background px-3 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kind">Kind</Label>
          <select
            id="kind"
            name="kind"
            defaultValue={selectedKind}
            required
            className="h-9 w-full rounded border bg-background px-3 text-sm"
          >
            {PLAN_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        {allowedParentKinds.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="parentPlanId">Parent ({allowedParentKinds.join(" or ")})</Label>
            <select
              id="parentPlanId"
              name="parentPlanId"
              defaultValue={sp.parentPlanId ?? ""}
              className="h-9 w-full rounded border bg-background px-3 text-sm"
            >
              <option value="">— none —</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.kind}] {p.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="summary">Summary</Label>
          <Textarea id="summary" name="summary" rows={2} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="body">Body (markdown)</Label>
          <Textarea id="body" name="body" rows={12} className="font-mono text-sm" />
        </div>
        <Button type="submit">Create plan</Button>
      </form>
    </div>
  );
}
