import { listDeployments } from "@/operations/work/deployments";

import { serializeCockpitDeployment } from "../serialize";
import { CICDTab } from "../tabs/CICDTab";

export default async function ProjectCicdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deployments = await listDeployments({ projectId: id, limit: 50 });

  return <CICDTab deployments={deployments.map(serializeCockpitDeployment)} />;
}
