import type { ApiKey } from "@/db/schema/api-key";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  projectId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  status: "active" | "revoked" | "expired";
}

export function serializeApiKey(k: ApiKey): ApiKeyRow {
  const now = new Date();
  let status: ApiKeyRow["status"] = "active";
  if (k.revokedAt) status = "revoked";
  else if (k.expiresAt && k.expiresAt < now) status = "expired";

  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    projectId: k.projectId,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    status,
  };
}
