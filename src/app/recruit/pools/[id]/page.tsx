import { notFound } from "next/navigation";
import { fetchPoolDetail } from "@/actions/pools";
import { listRoles } from "@/actions/roles";
import { serializePoolDetail, buildRoleMap } from "./serialize";
import PoolDetailClient from "./PoolDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PoolDetailPage({ params }: Props) {
  const { id } = await params;

  const [pool, roles] = await Promise.all([
    fetchPoolDetail(id),
    listRoles(),
  ]);

  if (!pool) {
    notFound();
  }

  const roleMap = buildRoleMap(Array.isArray(roles) ? roles : []);
  const props = serializePoolDetail(pool as any, roleMap);

  return <PoolDetailClient {...props} />;
}
