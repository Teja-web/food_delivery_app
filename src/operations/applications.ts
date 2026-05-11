import { createEntityCrud } from "@/lib/crud";
import { db } from "@/db/client";
import { applications, roles } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { applicationSchema } from "./schemas";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const pipelineCrud = createEntityCrud({
  db,
  table: applications,
  queryKey: "applications",
  idField: "id",
  schema: applicationSchema,
  onMutate: () => { safeRevalidate("/roles"); safeRevalidate("/roles/[id]", "page"); },
  getWith: { role: true, candidate: true, match: true, interviews: true, offers: true },
  searchFields: ["source"],
});

export const getPipelineEntries = pipelineCrud.list;
export const searchPipelineEntries = pipelineCrud.search;

/** Aggregate pipeline stage counts grouped by roleId. */
export async function getPipelineStageCounts(organizationId: string) {
  return db
    .select({
      roleId: applications.roleId,
      stage: applications.stage,
      count: sql<number>`count(*)::int`,
    })
    .from(applications)
    .where(eq(applications.organizationId, organizationId))
    .groupBy(applications.roleId, applications.stage);
}
export const getApplication = pipelineCrud.get;
export const updateApplication = pipelineCrud.update;
export const deleteApplication = pipelineCrud.delete;

/**
 * Create an application. For vendor users, the application's `organizationId`
 * derives from the **role** (hiring org) and `submittedByOrgId` is stamped
 * with the vendor's own org id. Internal users preserve the existing path
 * (org from ctx, no submittedByOrgId).
 *
 * (vendor-and-attribution-plan.md Phase 3.)
 */
export async function createApplication(data: unknown) {
  const ctx = await getActionContext();
  if (ctx.orgType !== "vendor") {
    return pipelineCrud.create(data);
  }

  const input = data as Record<string, unknown>;
  const roleId = input.roleId as string | undefined;
  if (!roleId) throw new Error("roleId is required");

  const role = await db.query.roles.findFirst({
    where: eq(roles.id, roleId),
    columns: { organizationId: true, vendorVisibility: true, exclusiveVendorOrgId: true },
  });
  if (!role) throw new Error("Role not found");

  // Verify the vendor is actually allowed to submit to this role.
  const visibleAll = role.vendorVisibility === "all" && ctx.partneredHiringOrgIds.includes(role.organizationId);
  const visibleExclusive = role.vendorVisibility === "exclusive" && role.exclusiveVendorOrgId === ctx.organizationId && ctx.partneredHiringOrgIds.includes(role.organizationId);
  if (!visibleAll && !visibleExclusive) {
    throw new Error("Role not visible to this vendor");
  }

  const validated = applicationSchema.parse({
    ...input,
    organizationId: role.organizationId,
  });

  const [record] = await db
    .insert(applications)
    .values({
      ...(validated as any),
      organizationId: role.organizationId,
      submittedByOrgId: ctx.organizationId,
      createdById: ctx.userId,
      createdByName: ctx.user.name,
    } as any)
    .returning();

  safeRevalidate("/roles");
  safeRevalidate("/roles/[id]", "page");
  return record;
}
