import { listOpenRoles } from "@/actions/roles";
import { fetchRoleFulfilments } from "@/actions/triage";
import { serializeListRole, type SerializedListRole } from "./serialize";
import RolesClient from "./RolesList";

const PAGE_SIZE = 25;

export default async function RolesPage() {
  const openResult = await listOpenRoles({ offset: 0, limit: PAGE_SIZE });
  const openIds = openResult.items.map((r: any) => r.id);
  const fulfilments = await fetchRoleFulfilments(openIds);
  const openRoles: SerializedListRole[] = openResult.items
    .map((r: any) => serializeListRole(r, fulfilments[r.id] ?? null))
    .sort((a: SerializedListRole, b: SerializedListRole) => b.urgencyScore - a.urgencyScore);

  return (
    <RolesClient
      roles={openRoles}
      openTotal={openResult.total}
    />
  );
}
