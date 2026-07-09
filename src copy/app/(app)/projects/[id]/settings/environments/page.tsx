import { Badge } from "@/components/ui/badge";
import { listEnvironmentsForProject } from "@/operations/project/environments";

export default async function EnvironmentsSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const envs = await listEnvironmentsForProject(id);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Deploy targets for this project. Replaces the free-text{" "}
        <code className="font-mono">deployments.environment</code> column.
      </p>

      {envs.length === 0 ? (
        <div className="rounded border bg-muted/20 p-6 text-sm text-muted-foreground">
          No environments defined yet.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 font-medium">URL</th>
            </tr>
          </thead>
          <tbody>
            {envs.map((e) => (
              <tr key={e.id} className="border-b hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{e.name}</td>
                <td className="px-3 py-2">
                  {e.tier ? (
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {e.tier}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {e.url}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
