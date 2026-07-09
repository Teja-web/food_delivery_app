/**
 * Simplified CRUD Factory with hybrid search support.
 * PG triggers handle activity events, hybrid search handles discovery.
 */

import { eq, sql, and, inArray, desc } from "drizzle-orm";
import { getActionContext, isWorkerContext } from "./auth/context";
import type { ScopedActionContext } from "./auth/context";
import type { ZodObject } from "zod/v4";
import { searchHybrid } from "./search";

const DEFAULT_PAGE_SIZE = 15;

interface EntityCrudConfig {
  db: any;
  table: any;
  queryKey: string;
  idField: string;
  schema: ZodObject;
  getContext?: () => Promise<ScopedActionContext>;
  onMutate?: () => void;
  getWith?: Record<string, unknown>;
  searchFields?: string[];
  searchConfig?: { tableName: string };
  hooks?: {
    afterCreate?: (record: any, ctx: ScopedActionContext) => Promise<void>;
    afterUpdate?: (record: any, ctx: ScopedActionContext) => Promise<void>;
    afterDelete?: (id: string, ctx: ScopedActionContext) => Promise<void>;
  };
  /** Entity-level scope applied to all reads (e.g. only active records) */
  scope?: (table: any) => any;
  /**
   * Replaces the default `ctx.orgScope(table)` predicate for this entity. Used
   * by `candidates` so visibility joins through `org_candidates` instead of
   * reading `candidates.organization_id` directly. Composes with `scope`:
   * reads use `and(scopeOverride, scope)`; write paths use `scopeOverride`
   * alone (matching the prior behavior of `orgScopeAnd`).
   */
  scopeOverride?: (ctx: ScopedActionContext, table: any) => any;
}

function friendlyDbError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);

  // Drizzle wraps PostgreSQL errors - check nested cause for actual error details
  const cause = (err as { cause?: unknown })?.cause;
  const causeObj = cause as { code?: string; detail?: string; constraint?: string; message?: string } | undefined;
  const errObj = err as { code?: string; detail?: string; constraint?: string };

  // Combine properties from both error and its cause
  const detail = errObj.detail ?? causeObj?.detail ?? "";
  const code = errObj.code ?? causeObj?.code ?? "";
  const constraint = errObj.constraint ?? causeObj?.constraint ?? "";
  const fullMsg = msg + (causeObj?.message ?? "");

  // PostgreSQL error code 23505 = unique_violation
  const isUniqueViolation =
    code === "23505" ||
    fullMsg.includes("unique constraint") ||
    fullMsg.includes("duplicate key") ||
    detail.includes("already exists");

  if (isUniqueViolation) {
    // Try to extract constraint name from message or constraint property
    const constraintMatch = fullMsg.match(/unique constraint "([^"]+)"/) || fullMsg.match(/constraint "([^"]+)"/);
    const constraintName = constraint || constraintMatch?.[1] || "";
    const knownCols = ["email", "phone", "name", "slug", "code", "key", "url"];
    const col = knownCols.find((c) => constraintName.includes(c) || detail.toLowerCase().includes(c));
    throw new Error(
      col ? `A candidate with this ${col} already exists` : "A record with these values already exists (duplicate)",
    );
  }
  if (fullMsg.includes("not-null constraint") || fullMsg.includes("violates not-null")) {
    const match = fullMsg.match(/column "([^"]+)"/);
    throw new Error(match?.[1] ? `${match[1]} is required` : "A required field is missing");
  }
  if (fullMsg.includes("foreign key constraint") || fullMsg.includes("violates foreign key")) {
    throw new Error("Referenced record not found or cannot be removed while in use");
  }
  // Clean up Drizzle's "Failed query:" wrapper - show a cleaner message
  if (msg.startsWith("Failed query:")) {
    // Extract any useful info from the error
    if (detail) {
      throw new Error(detail);
    }
    throw new Error("Database error. Please try again or contact support.");
  }
  throw err;
}

export function createEntityCrud(config: EntityCrudConfig) {
  const {
    db,
    table,
    queryKey,
    idField,
    schema,
    getContext = getActionContext,
    onMutate,
    getWith,
    searchFields,
    searchConfig,
    hooks,
    scope,
    scopeOverride,
  } = config;

  /** Org-scope predicate (with override) — used by write paths. */
  function writeScope(ctx: ScopedActionContext) {
    return scopeOverride ? scopeOverride(ctx, table) : ctx.orgScope(table);
  }

  /** Compose org scope with optional entity-level scope for all reads. */
  function baseWhere(ctx: ScopedActionContext) {
    const org = writeScope(ctx);
    return scope ? and(org, scope(table)) : org;
  }

  /**
   * Build a full-text search WHERE clause using to_tsvector/to_tsquery.
   * Concatenates all searchFields into a single tsvector, matches with
   * prefix-enabled tsquery. Falls back to no filter on parse failure.
   */
  function buildSearchWhere(orgWhere: any, search?: string) {
    if (!search || !searchFields || searchFields.length === 0) return orgWhere;
    const cols = searchFields.filter((f) => table[f] != null);
    if (cols.length === 0) return orgWhere;

    const tsQuery = search
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `${w}:*`)
      .join(" & ");

    if (!tsQuery) return orgWhere;

    const concatExpr = cols.map((f) => sql`coalesce(${table[f]}, '')`);
    const tsvec = sql`coznt.fts_vector(${sql.join(concatExpr, sql`, `)})`;
    const tsq = sql`to_tsquery('english', ${tsQuery})`;

    return and(orgWhere, sql`${tsvec} @@ ${tsq}`);
  }

  return {
    async list(opts?: {
      offset?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
      where?: (table: any) => any;
    }) {
      const { offset = 0, limit = DEFAULT_PAGE_SIZE, sortBy, sortOrder, where: extraWhere } = opts ?? {};
      const ctx = await getContext();
      const whereClause = extraWhere ? and(baseWhere(ctx), extraWhere(table)) : baseWhere(ctx);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(whereClause);
      const total = Number(countResult?.count ?? 0);

      const items = await db.query[queryKey].findMany({
        where: whereClause,
        orderBy: (t: any, helpers: any) => {
          const field = sortBy && sortBy in t ? t[sortBy] : t.createdAt;
          return sortOrder === "asc" ? [helpers.asc(field)] : [helpers.desc(field)];
        },
        limit,
        offset,
        ...(getWith ? { with: getWith } : {}),
      });

      return { items, total };
    },

    async search(query: string, opts?: { offset?: number; limit?: number }) {
      if (!searchFields || searchFields.length === 0) {
        throw new Error(`searchFields not configured for ${queryKey}`);
      }
      const { offset = 0, limit = DEFAULT_PAGE_SIZE } = opts ?? {};
      const ctx = await getContext();

      const cols = searchFields.filter((f) => table[f] != null);
      const tsQuery = query
        .replace(/[^a-zA-Z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((w) => `${w}:*`)
        .join(" & ");

      if (!tsQuery || cols.length === 0) return { items: [], total: 0 };

      const concatExpr = cols.map((f) => sql`coalesce(${table[f]}, '')`);
      const tsvec = sql`coznt.fts_vector(${sql.join(concatExpr, sql`, `)})`;
      const tsq = sql`to_tsquery('english', ${tsQuery})`;
      const whereClause = and(baseWhere(ctx), sql`${tsvec} @@ ${tsq}`);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(whereClause);
      const total = Number(countResult?.count ?? 0);

      // Fetch IDs ordered by relevance score
      const ranked = await db
        .select({
          id: table[idField],
          rank: sql<number>`ts_rank(${tsvec}, ${tsq})`,
        })
        .from(table)
        .where(whereClause)
        .orderBy(sql`ts_rank(${tsvec}, ${tsq}) desc`)
        .offset(offset)
        .limit(limit);

      if (ranked.length === 0) return { items: [], total };

      const ids = ranked.map((r: any) => r.id);
      const rankMap = new Map(ranked.map((r: any) => [r.id, r.rank]));

      // Hydrate with relations
      const items = await db.query[queryKey].findMany({
        where: inArray(table[idField], ids),
        ...(getWith ? { with: getWith } : {}),
      });

      // Preserve relevance order
      items.sort((a: any, b: any) => Number(rankMap.get(b[idField]) ?? 0) - Number(rankMap.get(a[idField]) ?? 0));

      return { items, total };
    },

    async searchSemantic(query: string, opts?: { offset?: number; limit?: number }) {
      if (!searchConfig) throw new Error(`searchConfig not configured for ${queryKey}`);
      const { offset = 0, limit = DEFAULT_PAGE_SIZE } = opts ?? {};
      const ctx = await getContext();

      const hits = await searchHybrid(db, query, searchConfig.tableName, {
        organizationId: ctx.organizationId,
        limit: offset + limit,
      });

      const paged = hits.slice(offset, offset + limit);
      if (paged.length === 0) return { items: [], total: hits.length };

      const ids = paged.map((h) => h.record.id);
      const scoreMap = new Map(paged.map((h) => [h.record.id, h.score]));

      const records = await db.query[queryKey].findMany({
        where: and(baseWhere(ctx), inArray(table[idField], ids)),
        ...(getWith ? { with: getWith } : {}),
      });

      records.sort((a: any, b: any) => (scoreMap.get(b[idField]) ?? 0) - (scoreMap.get(a[idField]) ?? 0));

      const items = records.map((r: any) => ({
        ...r,
        _score: scoreMap.get(r[idField]) ?? 0,
      }));

      return { items, total: hits.length };
    },

    async get(id: string, options?: { with?: Record<string, unknown> }) {
      const ctx = await getContext();
      const withClause = options?.with ? { ...getWith, ...options.with } : getWith;
      return db.query[queryKey].findFirst({
        where: and(baseWhere(ctx), eq(table[idField], id)),
        ...(withClause ? { with: withClause } : {}),
      });
    },

    async create(data: unknown) {
      const ctx = await getContext();
      const audit = ctx.auditCreate();
      const validated = schema.parse({
        ...(data as Record<string, unknown>),
        organizationId: audit.organizationId,
      });

      let record: any;
      try {
        [record] = await db.insert(table).values({ ...(validated as Record<string, unknown>), ...audit }).returning();
      } catch (err) {
        friendlyDbError(err);
      }

      if (hooks?.afterCreate) await hooks.afterCreate(record, ctx);
      if (!isWorkerContext()) onMutate?.();
      return record;
    },

    async update(id: string, data: unknown) {
      const ctx = await getContext();
      const validated = schema.partial().parse(data);

      // Only include fields that were explicitly provided in the input —
      // Zod defaults can inject values (e.g. status: "draft") for missing fields
      const inputKeys = new Set(Object.keys(data as Record<string, unknown>));
      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(validated as Record<string, unknown>)) {
        if (inputKeys.has(key)) updateData[key] = value;
      }

      let record: any;
      try {
        [record] = await db
          .update(table)
          .set({ ...updateData, ...ctx.auditUpdate() })
          .where(and(writeScope(ctx), eq(table[idField], id)))
          .returning();
      } catch (err) {
        friendlyDbError(err);
      }

      if (hooks?.afterUpdate) await hooks.afterUpdate(record, ctx);
      if (!isWorkerContext()) onMutate?.();
      return record;
    },

    async delete(id: string) {
      const ctx = await getContext();
      try {
        await db
          .delete(table)
          .where(and(writeScope(ctx), eq(table[idField], id)));
      } catch (err) {
        friendlyDbError(err);
      }

      if (hooks?.afterDelete) await hooks.afterDelete(id, ctx);
      if (!isWorkerContext()) onMutate?.();
    },
  };
}
