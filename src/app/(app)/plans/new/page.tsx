import { redirect } from "next/navigation";
import { createPlan } from "@/actions/plans";
import { listProjects } from "@/actions/projects";
import { PLAN_KINDS } from "@/db/schema/plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

async function action(formData: FormData) {
  "use server";
  const created = await createPlan({
    projectId: String(formData.get("projectId")),
    kind: String(formData.get("kind")) as (typeof PLAN_KINDS)[number],
    title: String(formData.get("title") ?? "").trim(),
    summary: String(formData.get("summary") ?? "").trim() || undefined,
    body: String(formData.get("body") ?? ""),
  });
  redirect(`/plans/${created.id}`);
}

export default async function NewPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const sp = await searchParams;
  const { items: projects } = await listProjects({ limit: 100 });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">New plan</h1>
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="projectId">Project</Label>
          <select
            id="projectId"
            name="projectId"
            defaultValue={sp.projectId ?? projects[0]?.id ?? ""}
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
          <select id="kind" name="kind" required className="h-9 w-full rounded border bg-background px-3 text-sm">
            {PLAN_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
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
