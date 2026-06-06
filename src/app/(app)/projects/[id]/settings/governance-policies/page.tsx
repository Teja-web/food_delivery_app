import { Badge } from "@/components/ui/badge";
import { listPoliciesForProject } from "@/operations/governance/policies";

export default async function ProjectGovernancePoliciesSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const policies = await listPoliciesForProject(id);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-base font-semibold">Governance policies</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Project-scoped policies plus inherited org-wide ones. To inspect outcomes,
          open the Governance tab.
        </p>
      </header>

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
              <th className="px-3 py-2 font-medium">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} className="border-b hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{p.name}</td>
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
                <td className="px-3 py-2 text-xs">{p.enabled ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
