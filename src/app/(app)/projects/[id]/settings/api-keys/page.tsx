import { notFound } from "next/navigation";

import { getProject } from "@/actions/project/projects";
import type { ApiKey } from "@/db/schema/api-key";
import type { Project } from "@/db/schema/project";
import { getCurrentUser } from "@/lib/auth/actions";
import { listApiKeysForProject } from "@/operations/integration/api-keys";

import {
  ProjectApiKeysSection,
  type ProjectApiKeyRow,
} from "../ProjectApiKeysSection";

function serializeApiKey(k: ApiKey): ProjectApiKeyRow {
  const now = new Date();
  let status: ProjectApiKeyRow["status"] = "active";
  if (k.revokedAt) status = "revoked";
  else if (k.expiresAt && k.expiresAt < now) status = "expired";

  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    role: k.role,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    status,
  };
}

export default async function ApiKeysSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  const [apiKeys, currentUser] = await Promise.all([
    listApiKeysForProject(id),
    getCurrentUser(),
  ]);

  return (
    <ProjectApiKeysSection
      projectId={id}
      initialKeys={apiKeys.map(serializeApiKey)}
      canCreateApiKeys={currentUser.role === "owner"}
    />
  );
}
