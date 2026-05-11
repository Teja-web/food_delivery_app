import { listClosedRoles } from "@/actions/roles";
import { serializeListRole } from "../serialize";
import ArchiveClient from "./ArchiveClient";

const PAGE_SIZE = 50;

export default async function RolesArchivePage() {
  const result = await listClosedRoles({ offset: 0, limit: PAGE_SIZE });
  const roles = result.items.map((r: any) => serializeListRole(r));
  return <ArchiveClient roles={roles} total={result.total} />;
}
