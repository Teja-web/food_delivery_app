import { listWorkItemsForProject } from "@/operations/work/work-items";

import { serializeCockpitWorkItem } from "../serialize";
import { WorkItemsTab } from "../tabs/WorkItemsTab";

export default async function ProjectWorkItemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const items = await listWorkItemsForProject(id, { limit: 200 });

  return <WorkItemsTab items={items.map(serializeCockpitWorkItem)} />;
}
