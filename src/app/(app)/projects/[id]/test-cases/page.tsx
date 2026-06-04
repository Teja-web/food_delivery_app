import { listPlansByProject } from "@/operations/plan/plans";

import { serializeCockpitPlan } from "../serialize";
import { PlansTab } from "../tabs/PlansTab";

const TEST_KINDS = ["test_plan"];

export default async function ProjectTestPlansPage({
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
      kinds={TEST_KINDS}
      title="Test plans"
      emptyHint="No test plans yet"
    />
  );
}
