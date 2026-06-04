import type { ApiKeyWithContext } from "@/operations/integration/api-keys";

export type ApiKeyStatus = "active" | "revoked" | "expired";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  role: string;
  projectId: string | null;
  projectName: string;
  projectSlug: string;
  createdByName: string | null;
  createdByEmail: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  status: ApiKeyStatus;
}

export interface ProjectOption {
  id: string;
  name: string;
  slug: string;
}

export interface OrgKpis {
  active: number;
  revoked: number;
  expired: number;
  projectsWithKeys: number;
}

export interface ProjectGroup {
  projectId: string | null;
  projectName: string;
  projectSlug: string;
  total: number;
  active: number;
  keys: ApiKeyRow[];
}

export function serializeApiKey(k: ApiKeyWithContext): ApiKeyRow {
  const now = new Date();
  let status: ApiKeyStatus = "active";
  if (k.revokedAt) status = "revoked";
  else if (k.expiresAt && k.expiresAt < now) status = "expired";

  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    role: k.role,
    projectId: k.projectId,
    projectName: k.projectName ?? "(deleted project)",
    projectSlug: k.projectSlug ?? "",
    createdByName: k.createdByName,
    createdByEmail: k.createdByEmail,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    status,
  };
}

export function computeKpis(rows: ApiKeyRow[]): OrgKpis {
  let active = 0;
  let revoked = 0;
  let expired = 0;
  const projectIds = new Set<string>();
  for (const r of rows) {
    if (r.status === "active") active++;
    else if (r.status === "revoked") revoked++;
    else if (r.status === "expired") expired++;
    if (r.projectId) projectIds.add(r.projectId);
  }
  return { active, revoked, expired, projectsWithKeys: projectIds.size };
}

export function groupByProject(rows: ApiKeyRow[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();
  for (const r of rows) {
    const key = r.projectId ?? "__orphaned__";
    const existing = map.get(key);
    if (existing) {
      existing.keys.push(r);
      existing.total++;
      if (r.status === "active") existing.active++;
    } else {
      map.set(key, {
        projectId: r.projectId,
        projectName: r.projectName,
        projectSlug: r.projectSlug,
        total: 1,
        active: r.status === "active" ? 1 : 0,
        keys: [r],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.active !== a.active) return b.active - a.active;
    return a.projectName.localeCompare(b.projectName);
  });
}
