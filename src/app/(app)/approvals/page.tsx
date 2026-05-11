import Link from "next/link";
import { listApprovals } from "@/actions/approvals";

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
              <th className="border-b py-2 font-medium">Plan</th>
              <th className="border-b py-2 font-medium">Requested by</th>
              <th className="border-b py-2 font-medium">Status</th>
              <th className="border-b py-2 font-medium">Requested</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="hover:bg-muted/30">
                <td className="border-b py-2">
                  <Link href={`/plans/${a.planId}`} className="hover:underline">
                    {a.planId.slice(0, 8)}…
                  </Link>
                </td>
                <td className="border-b py-2">{a.requestedByName ?? a.requestedById}</td>
                <td className="border-b py-2 capitalize">{a.status}</td>
                <td className="border-b py-2 text-muted-foreground">
                  {new Date(a.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
