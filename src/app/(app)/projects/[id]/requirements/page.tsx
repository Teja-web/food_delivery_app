import { listPlansByProject } from "@/operations/plan/plans";

import { serializeCockpitPlan } from "../serialize";
import { PlansTab } from "../tabs/PlansTab";

const REQUIREMENT_KINDS = ["epic", "feature", "story", "requirement"];

export default async function ProjectRequirementsPage({
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
      kinds={REQUIREMENT_KINDS}
      title="Requirements"
      emptyHint="No requirements yet — capture user stories, features, or epics here"
    />
  );
}
