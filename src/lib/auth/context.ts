/**
 * Action Context — org-scoped auth context for server actions and worker tasks.
 */

import { eq, and, inArray, SQL } from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";
import { getCurrentUser } from "./actions";

/**
 * Org type as it appears on `auth.organization.type` — "standard" for hiring
 * orgs, "vendor" for staffing partners. Drives scoping and offer-access in
 * `ScopedActionContext`.
 */
export type OrgType = "standard" | "vendor";

export interface ScopedActionContext {
  user: { id: string; name: string; email: string };
  organizationId: string;
  userId: string;
  isAdmin: boolean;
  role: string;
  /** Type of the active organization. Drives vendor scoping. */
  orgType: OrgType;
  /**
   * Hiring org ids the active vendor org has an active partnership with.
   * Empty array for non-vendor users. The set determines what `organizationId`
   * values a vendor's queries can match.
   */
  partneredHiringOrgIds: string[];
  /** False for vendor users — offer operations must throw early. */
  canAccessOffers: boolean;
  traceId?: string;
  taskId?: string;

  /**
   * Org-scope predicate for the table. For vendor users, this composes
   * `organizationId IN (partneredHiringOrgIds)` AND a per-attribution-column
   * predicate (`submittedByOrgId` for applications/interviews/engagements,
   * `addedByOrgId` for org_candidates). Tables without a vendor attribution
   * column receive only the partnered-orgs predicate; the operation layer is
   * responsible for guarding entities a vendor must not access (e.g. offers).
   */
  orgScope: <T extends { organizationId: unknown }>(table: T) => SQL<unknown>;
  orgScopeAnd: <T extends { organizationId: unknown }>(
    table: T,
    ...conditions: (SQL<unknown> | undefined)[]
  ) => SQL<unknown>;
  auditCreate: () => {
    organizationId: string;
    createdById: string;
    createdByName: string;
  };
  auditUpdate: () => {
    updatedById: string;
    updatedByName: string;
    updatedAt: Date;
  };
}

const messageContextStorage = new AsyncLocalStorage<ScopedActionContext>();

export function runWithContext<T>(
  ctx: ScopedActionContext,
  fn: () => Promise<T>,
): Promise<T> {
  return messageContextStorage.run(ctx, fn);
}

export function isWorkerContext(): boolean {
  return messageContextStorage.getStore() !== undefined;
}

/**
 * Build a context for worker tasks / non-request paths. Takes everything as
 * args because it can't read better-auth's session. The caller is responsible
 * for passing accurate `orgType` / `partneredHiringOrgIds` if vendor scoping
 * matters in the worker path; defaults assume a standard org.
 */
export function buildScopedContext(
  organizationId: string,
  user: { id: string; name: string },
  vendorOptions?: { orgType?: OrgType; partneredHiringOrgIds?: string[] },
): ScopedActionContext {
  const orgType = vendorOptions?.orgType ?? "standard";
  const partneredHiringOrgIds = vendorOptions?.partneredHiringOrgIds ?? [];
  const canAccessOffers = orgType !== "vendor";

  return {
    user: { ...user, email: "" },
    organizationId,
    userId: user.id,
    isAdmin: false,
    role: "member",
    orgType,
    partneredHiringOrgIds,
    canAccessOffers,

    orgScope: makeOrgScope(orgType, organizationId, partneredHiringOrgIds),
    orgScopeAnd: makeOrgScopeAnd(orgType, organizationId, partneredHiringOrgIds),

    auditCreate: () => ({
      organizationId,
      createdById: user.id,
      createdByName: user.name,
    }),

    auditUpdate: () => ({
      updatedById: user.id,
      updatedByName: user.name,
      updatedAt: new Date(),
    }),
  };
}

/**
 * Produce the orgScope predicate. Vendor and standard paths both narrow to a
 * single SQL fragment so call sites stay uniform.
 *
 * Standard: `organizationId = ctx.organizationId`.
 * Vendor:   `organizationId IN (partneredHiringOrgIds)` AND, when the table
 *           carries a vendor attribution column, `<col> = vendorOrgId`. The
 *           attribution column is detected by name on the table.
 *
 * Tables we attribution-filter on for vendors:
 *   - `submittedByOrgId` — applications, interviews, engagements
 *   - `addedByOrgId`     — org_candidates
 * Tables without one of these (e.g. matches, candidates) get only the
 * partnered-org filter; visibility on those is enforced by joins/EXISTS at
 * the operation layer.
 */
function makeOrgScope(
  orgType: OrgType,
  organizationId: string,
  partneredHiringOrgIds: string[],
) {
  return <T extends { organizationId: unknown }>(table: T): SQL<unknown> => {
    if (orgType !== "vendor") {
      return eq(table.organizationId as any, organizationId);
    }
    // Vendor with no partnerships sees nothing.
    if (partneredHiringOrgIds.length === 0) {
      return eq(table.organizationId as any, "__no_partnerships__");
    }
    const attribution = vendorAttributionColumn(table);
    const orgClause = inArray(table.organizationId as any, partneredHiringOrgIds);
    if (!attribution) return orgClause;
    return and(orgClause, eq(attribution, organizationId)) as SQL<unknown>;
  };
}

function makeOrgScopeAnd(
  orgType: OrgType,
  organizationId: string,
  partneredHiringOrgIds: string[],
) {
  const scope = makeOrgScope(orgType, organizationId, partneredHiringOrgIds);
  return <T extends { organizationId: unknown }>(
    table: T,
    ...conditions: (SQL<unknown> | undefined)[]
  ): SQL<unknown> => {
    const valid = conditions.filter((c): c is SQL<unknown> => c !== undefined);
    return and(scope(table), ...valid) as SQL<unknown>;
  };
}

/**
 * Return the vendor-attribution column on this table if one is present, else
 * null. Drizzle table columns are exposed as object properties named after
 * the JS field (e.g. `applications.submittedByOrgId`).
 */
function vendorAttributionColumn(table: any) {
  if (table.submittedByOrgId !== undefined) return table.submittedByOrgId;
  if (table.addedByOrgId !== undefined) return table.addedByOrgId;
  return null;
}

/**
 * Resolve `orgType` and the active partnered-hiring-org ids for this request.
 * Re-runs every call (no cache): when a hiring org pauses/revokes a
 * partnership, the vendor's NEXT request loses access. In-flight requests
 * complete with their already-resolved snapshot.
 */
async function resolveVendorState(organizationId: string): Promise<{
  orgType: OrgType;
  partneredHiringOrgIds: string[];
}> {
  const { db } = await import("@/db/client");
  const { organization, vendorPartnerships } = await import("@/db/schema");

  const org = await (db as any).query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { type: true },
  });
  const orgType: OrgType = org?.type === "vendor" ? "vendor" : "standard";

  if (orgType !== "vendor") {
    return { orgType, partneredHiringOrgIds: [] };
  }

  const partnerships = await (db as any).query.vendorPartnerships.findMany({
    where: and(
      eq(vendorPartnerships.vendorOrgId, organizationId),
      eq(vendorPartnerships.status, "active"),
    ),
    columns: { hiringOrgId: true },
  });
  return {
    orgType,
    partneredHiringOrgIds: partnerships.map((p: { hiringOrgId: string }) => p.hiringOrgId),
  };
}

export async function getActionContext(): Promise<ScopedActionContext> {
  const messageCtx = messageContextStorage.getStore();
  if (messageCtx) return messageCtx;

  const userContext = await getCurrentUser();

  if (!userContext?.currentUser) {
    throw new Error("Not authenticated");
  }
  if (!userContext.organizationId) {
    throw new Error("No organization context");
  }

  const { currentUser, organizationId } = userContext;
  const { orgType, partneredHiringOrgIds } = await resolveVendorState(organizationId);
  const canAccessOffers = orgType !== "vendor";

  return {
    user: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
    },
    organizationId,
    userId: currentUser.id,
    isAdmin: userContext.isAdmin ?? false,
    role: userContext.role ?? "member",
    orgType,
    partneredHiringOrgIds,
    canAccessOffers,

    orgScope: makeOrgScope(orgType, organizationId, partneredHiringOrgIds),
    orgScopeAnd: makeOrgScopeAnd(orgType, organizationId, partneredHiringOrgIds),

    auditCreate: () => ({
      organizationId,
      createdById: currentUser.id,
      createdByName: currentUser.name,
    }),

    auditUpdate: () => ({
      updatedById: currentUser.id,
      updatedByName: currentUser.name,
      updatedAt: new Date(),
    }),
  };
}

/**
 * Thrown when an operation runs in a context without the required permission
 * (e.g. a vendor user calling an offers op). Distinct from "not found" so
 * the API layer can map it to 403.
 */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Assert the active org isn't a vendor. Use at the top of offer operations
 * and any other surface vendors must not reach.
 */
export async function requireNonVendorContext(): Promise<ScopedActionContext> {
  const ctx = await getActionContext();
  if (!ctx.canAccessOffers) {
    throw new ForbiddenError("Offers are not accessible to vendor organizations");
  }
  return ctx;
}

export async function requireOrgContext(): Promise<{
  organizationId: string;
  userId: string;
  userName: string | null;
}> {
  const messageCtx = messageContextStorage.getStore();
  if (messageCtx) {
    return { organizationId: messageCtx.organizationId, userId: messageCtx.userId, userName: null };
  }

  const userContext = await getCurrentUser();
  if (!userContext?.currentUser) throw new Error("Not authenticated");
  if (!userContext.organizationId) throw new Error("No organization context");

  return {
    organizationId: userContext.organizationId,
    userId: userContext.currentUser.id,
    userName: userContext.currentUser.name ?? null,
  };
}

interface CandidateContext {
  email: string;
  name: string | null;
  userId: string;
  // organizationId is the candidate's creator stamp and may be NULL for
  // portal-only candidates not yet adopted by any org. Visibility is driven
  // by org_candidates, not this field. Callers that previously forwarded
  // this id to downstream operations should derive org from the role,
  // assessment, or interview being acted on instead.
  linkedCandidates: Array<{ id: string; organizationId: string | null }>;
}

export async function requireCandidateContext(): Promise<CandidateContext> {
  const userContext = await getCurrentUser();
  if (!userContext?.currentUser) throw new Error("Not authenticated");

  const { currentUser } = userContext;
  const email = currentUser.email;

  // Import db and candidates lazily to avoid circular deps
  const { db } = await import("@/db/client");
  const { candidates } = await import("@/db/schema");
  const { sql } = await import("drizzle-orm");

  // Find all candidate records linked to this email
  const linked = await db
    .select({ id: candidates.id, organizationId: candidates.organizationId })
    .from(candidates)
    .where(sql`lower(${candidates.email}) = ${email.toLowerCase()}`);

  return {
    email,
    name: currentUser.name ?? null,
    userId: currentUser.id,
    linkedCandidates: linked,
  };
}
