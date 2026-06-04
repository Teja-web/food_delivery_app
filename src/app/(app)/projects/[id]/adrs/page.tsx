import { listPlansByProject } from "@/operations/plan/plans";

import { serializeCockpitPlan } from "../serialize";
import { PlansTab } from "../tabs/PlansTab";

const ADR_KINDS = ["adr"];

export default async function ProjectAdrsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plans = await listPlansByProject(id, { limit: 100 });

  return (
    <PlansTab
      plans={plans.map(serializeCockpitPlan)}
      projectId={id}
      kinds={ADR_KINDS}
      title="Architecture decision records"
      emptyHint="No ADRs yet — record the load-bearing technical decisions for this project"
    />
  );
}
