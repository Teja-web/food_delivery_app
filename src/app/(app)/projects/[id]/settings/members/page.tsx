import { listOrgMembers } from "@/operations/auth/members";

export default async function MembersSettings() {
  const members = await listOrgMembers().catch(() => []);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">Members</h2>
        <p className="text-xs text-muted-foreground">
          Org members can be granted project roles via /settings (org level).
          This view lists who currently has access.
        </p>
      </header>
      {members.length === 0 ? (
        <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          No members loaded.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => (
                <tr key={m.userId}>
                  <td className="px-3 py-2">{m.userName ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {m.userEmail ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                    {m.role}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
