import { listRules } from "@/actions/rules";
import type { Rule } from "@/db/schema/rule";

export default async function RulesPage() {
  const { items } = (await listRules({ limit: 100 })) as { items: Rule[] };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Rules</h1>
      {items.length === 0 ? (
        <div className="rounded border bg-muted/30 p-8 text-sm text-muted-foreground">
          No rules yet. Add rules to enforce conventions across projects.
        </div>
      ) : (
        <ul className="divide-y rounded border">
          {items.map((r) => (
            <li key={r.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.phase ?? "all phases"} · {r.severity}
                    {r.projectId ? "" : " · org-wide"}
                  </div>
                </div>
                <span className={r.enabled ? "text-green-600" : "text-muted-foreground"}>
                  {r.enabled ? "enabled" : "disabled"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
