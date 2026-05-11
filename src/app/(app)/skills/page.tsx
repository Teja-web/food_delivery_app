import { listSkills } from "@/actions/skills";

export default async function SkillsPage() {
  const { items } = await listSkills({ limit: 100 });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Skills</h1>
      {items.length === 0 ? (
        <div className="rounded border bg-muted/30 p-8 text-sm text-muted-foreground">
          No skills yet. Skills are reusable agent workflows callable over the HTTP API.
        </div>
      ) : (
        <ul className="divide-y rounded border">
          {items.map((s) => (
            <li key={s.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.slug}
                    {s.projectId ? "" : " · org-wide"}
                  </div>
                </div>
                <span className={s.enabled ? "text-green-600" : "text-muted-foreground"}>
                  {s.enabled ? "enabled" : "disabled"}
                </span>
              </div>
              {s.description ? <p className="mt-1 text-xs text-muted-foreground">{s.description}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
