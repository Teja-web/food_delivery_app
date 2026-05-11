import Link from "next/link";
import { listPlans } from "@/actions/plans";

export default async function PlansPage() {
  const { items } = await listPlans({ limit: 100 });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Plans</h1>

      {items.length === 0 ? (
        <div className="rounded border bg-muted/30 p-8 text-sm text-muted-foreground">
          No plans yet. Open a project and click <em>New plan</em>.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="border-b py-2 font-medium">Title</th>
              <th className="border-b py-2 font-medium">Kind</th>
              <th className="border-b py-2 font-medium">Status</th>
              <th className="border-b py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="border-b py-2">
                  <Link href={`/plans/${p.id}`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                </td>
                <td className="border-b py-2 capitalize">{p.kind.replace("_", " ")}</td>
                <td className="border-b py-2 capitalize">{p.status.replace("_", " ")}</td>
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
