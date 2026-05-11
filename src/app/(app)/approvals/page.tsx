import Link from "next/link";
import { listApprovals } from "@/actions/approvals";

const TARGET_HREF: Record<string, (id: string) => string | null> = {
  plan: (id) => `/plans/${id}`,
  phase_gate: () => null,
  release: () => null,
  work_item: () => null,
};

export default async function ApprovalsPage() {
  const { items } = await listApprovals({ limit: 100 });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Approvals</h1>
      {items.length === 0 ? (
        <div className="rounded border bg-muted/30 p-8 text-sm text-muted-foreground">
          No approvals yet. Plans in <em>draft</em> can request an approval to enter review.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="border-b py-2 font-medium">Target</th>
              <th className="border-b py-2 font-medium">Type</th>
              <th className="border-b py-2 font-medium">Requested by</th>
              <th className="border-b py-2 font-medium">Status</th>
              <th className="border-b py-2 font-medium">Requested</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => {
              const href = TARGET_HREF[a.entityType]?.(a.entityId) ?? null;
              return (
                <tr key={a.id} className="hover:bg-muted/30">
                  <td className="border-b py-2">
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {a.entityId.slice(0, 8)}…
                      </Link>
                    ) : (
                      <span>{a.entityId.slice(0, 8)}…</span>
                    )}
                  </td>
                  <td className="border-b py-2 capitalize">{a.entityType.replace("_", " ")}</td>
                  <td className="border-b py-2">{a.requestedByName ?? a.requestedById}</td>
                  <td className="border-b py-2 capitalize">{a.status}</td>
                  <td className="border-b py-2 text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
