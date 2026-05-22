import type { ApiKey } from "@/db/schema/api-key";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  status: "active" | "revoked" | "expired";
}

export interface ProjectOption {
  id: string;
  name: string;
  slug: string;
}

export function serializeApiKey(
  k: ApiKey,
  projectsById: Map<string, ProjectOption>,
): ApiKeyRow {
  const now = new Date();
  let status: ApiKeyRow["status"] = "active";
  if (k.revokedAt) status = "revoked";
  else if (k.expiresAt && k.expiresAt < now) status = "expired";

  const project = projectsById.get(k.projectId);

  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    projectId: k.projectId,
    projectName: project?.name ?? "(deleted)",
    projectSlug: project?.slug ?? "",
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    status,
  };
}
