import { listPools, getPoolNewMemberCounts } from "@/actions/pools";
import { listRoles } from "@/actions/roles";
import { getActionContext } from "@/lib/auth/context";
import { serializePoolsList, buildRoleMap } from "./serialize";
import PoolsClient from "./PoolsClient";

const PAGE_SIZE = 25;

export default async function PoolsPage() {
  const ctx = await getActionContext();

  const [poolsResult, rolesResult, newMembersMap] = await Promise.all([
    listPools({ offset: 0, limit: PAGE_SIZE }),
    listRoles(),
    getPoolNewMemberCounts(ctx.organizationId),
  ]);

  const pools = poolsResult?.items ?? [];
  const total = poolsResult?.total ?? 0;
  const roles = rolesResult?.items ?? [];

  const roleMap = buildRoleMap(roles);
  const serializedPools = serializePoolsList(pools, roleMap, newMembersMap);

  return <PoolsClient pools={serializedPools} total={total} />;
}
