import { z } from "zod/v4";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import {
  adapterBindings,
  ADAPTER_PROVIDERS,
  type AdapterBinding,
  type AdapterProvider,
} from "@/db/schema/adapter-binding";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { jiraExternalKeyLookupCandidates } from "@/lib/integrations/jira-keys";

const adapterBindingSchema = z.object({
  projectId: z.string().min(1),
  provider: z.enum(ADAPTER_PROVIDERS),
  externalKey: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const adapterBindingCrud = createEntityCrud({
  db,
  table: adapterBindings,
  queryKey: "adapterBindings",
  idField: "id",
  schema: adapterBindingSchema,
  searchFields: ["externalKey", "provider"],
  // We can't target a specific project path without the row here — invalidate
  // the projects list and rely on Next's per-route revalidation on visit.
  onMutate: () => safeRevalidate("/projects"),
});

/** List bindings for a single project (org-scoped via the CRUD factory's read scope). */
export async function listBindingsForProject(projectId: string): Promise<AdapterBinding[]> {
  return db.query.adapterBindings.findMany({
    where: eq(adapterBindings.projectId, projectId),
    orderBy: (t, { asc }) => [asc(t.provider), asc(t.externalKey)],
  });
}

/**
 * Look up the coznt project bound to an external (provider, externalKey)
 * pair within an organization. Returns null if no binding exists.
 *
 * Note: this is the internal query — the public resolver entrypoint lives
 * at `src/lib/integrations/resolve.ts::resolveProjectForWebhook`.
 */
export async function findProjectIdForBinding(
  organizationId: string,
  provider: AdapterProvider,
  externalKey: string,
): Promise<string | null> {
  if (provider === "jira") {
    for (const candidate of jiraExternalKeyLookupCandidates(externalKey)) {
      const row = await db.query.adapterBindings.findFirst({
        where: and(
          eq(adapterBindings.organizationId, organizationId),
          eq(adapterBindings.provider, provider),
          sql`lower(${adapterBindings.externalKey}) = ${candidate.toLowerCase()}`,
        ),
        columns: { projectId: true },
      });
      if (row) return row.projectId;
    }
    return null;
  }

  const normalizedExternalKey = provider === "confluence"
    ? externalKey.trim().toUpperCase()
    : externalKey;
  const row = await db.query.adapterBindings.findFirst({
    where: and(
      eq(adapterBindings.organizationId, organizationId),
      eq(adapterBindings.provider, provider),
      provider === "confluence"
        ? sql`upper(${adapterBindings.externalKey}) = ${normalizedExternalKey}`
        : eq(adapterBindings.externalKey, normalizedExternalKey),
    ),
    columns: { projectId: true },
  });
  return row?.projectId ?? null;
}

/**
 * Reverse lookup — given a (project, provider), return the binding (externalKey
 * + config) used for outbound writes. Returns null when the project has no
 * binding for this provider, which is the "no-op" signal for outbound helpers.
 */
export async function getOutboundBinding(
  organizationId: string,
  projectId: string,
  provider: AdapterProvider,
): Promise<AdapterBinding | null> {
  const rows = await db.query.adapterBindings.findMany({
    where: and(
      eq(adapterBindings.organizationId, organizationId),
      eq(adapterBindings.projectId, projectId),
      eq(adapterBindings.provider, provider),
    ),
  });
  if (provider === "jira") {
    return rows.find((row) => row.externalKey.includes("/")) ?? rows[0] ?? null;
  }
  return rows[0] ?? null;
}
