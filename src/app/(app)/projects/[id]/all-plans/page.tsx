import { listPlansByProject } from "@/operations/plan/plans";

import { serializeCockpitPlan } from "../serialize";
import { PlansTab } from "../tabs/PlansTab";

export default async function ProjectAllPlansPage({
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
      kinds={null}
      title="All plans"
      emptyHint="No plans authored yet"
    />
  );
}
