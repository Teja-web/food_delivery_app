import { listPlansByProject } from "@/operations/plan/plans";
import { listWorkItemsForProject } from "@/operations/work/work-items";

import { serializeCockpitPlan, serializeCockpitWorkItem } from "../serialize";
import { DocumentsTab } from "../tabs/DocumentsTab";

export default async function ProjectDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [plans, workItems] = await Promise.all([
    listPlansByProject(id, { limit: 100 }),
    listWorkItemsForProject(id, { limit: 200 }),
  ]);

  return (
    <DocumentsTab
      plans={plans.map(serializeCockpitPlan)}
      workItems={workItems.map(serializeCockpitWorkItem)}
    />
  );
}
