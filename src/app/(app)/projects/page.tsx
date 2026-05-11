import Link from "next/link";
import { listProjects } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import { serializeProject } from "./serialize";

export default async function ProjectsPage() {
  const { items } = await listProjects({ limit: 100 });
  const projects = items.map(serializeProject);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Button asChild>
          <Link href="/projects/new">New project</Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded border bg-muted/30 p-8 text-sm text-muted-foreground">
          No projects yet. Create your first project to start drafting requirements.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="border-b py-2 font-medium">Name</th>
              <th className="border-b py-2 font-medium">Phase</th>
              <th className="border-b py-2 font-medium">Status</th>
              <th className="border-b py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="border-b py-2">
                  <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{p.slug}</div>
                </td>
                <td className="border-b py-2 capitalize">{p.phase}</td>
                <td className="border-b py-2 capitalize">{p.status}</td>
                <td className="border-b py-2 text-muted-foreground">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
