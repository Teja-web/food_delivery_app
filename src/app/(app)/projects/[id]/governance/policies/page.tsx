import { Badge } from "@/components/ui/badge";
import { listPoliciesForProject } from "@/operations/governance/policies";

export default async function GovernancePoliciesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const policies = await listPoliciesForProject(id);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Governance policies applicable to this project — project-scoped plus inherited
        org-wide.
      </p>

      {policies.length === 0 ? (
        <div className="rounded border bg-muted/20 p-6 text-sm text-muted-foreground">
          No policies defined.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Scope</th>
              <th className="px-3 py-2 font-medium">Transition</th>
              <th className="px-3 py-2 font-medium">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} className="border-b hover:bg-muted/30">
                <td className="px-3 py-2">
                  <div className="font-medium">{p.name}</div>
                  {p.description ? (
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {p.kind}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {p.scopeType}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {p.transitionFrom && p.transitionTo
                    ? `${p.transitionFrom} → ${p.transitionTo}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs">{p.enabled ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
