import { notFound } from "next/navigation";

import { getProject } from "@/actions/project/projects";
import { Toaster } from "@/components/ui/sonner";
import type { Project } from "@/db/schema/project";
import { hashArtifactBody, listProjectArtifacts } from "@/operations/artifacts";

import {
  ProjectStandardsTab,
  type ProjectStandardItem,
} from "../tabs/ProjectStandardsTab";

function serializeProjectStandard(
  row: Awaited<ReturnType<typeof listProjectArtifacts>>[number],
): ProjectStandardItem {
  return {
    id: row.id,
    title: typeof row.metadata.title === "string" && row.metadata.title.trim()
      ? row.metadata.title
      : row.name,
    body: row.body,
    type: row.type,
    category: row.category,
    requiredKey: row.metadata.requiredKey ?? null,
    sourceFileName: row.name,
    sourceOrganizationArtifactId:
      typeof row.metadata.sourceOrganizationArtifactId === "string"
        ? row.metadata.sourceOrganizationArtifactId
        : null,
    hash:
      typeof row.metadata.contentHash === "string"
        ? row.metadata.contentHash
        : hashArtifactBody(row.body),
    updatedAt: row.updatedAt.toISOString(),
    createdVia: row.createdVia,
  };
}

export default async function ProjectStandardsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  const rows = await listProjectArtifacts(id);
  const standards = rows.map(serializeProjectStandard);

  return (
    <>
      <ProjectStandardsTab projectId={id} standards={standards} />
      <Toaster />
    </>
  );
}
