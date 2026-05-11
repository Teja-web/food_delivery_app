/**
 * Public-facing role queries. Used by the unauthenticated /opportunities
 * surface and the /api/public/opportunities routes. Every read goes through
 * `publicizeRole` (the security boundary) before returning.
 *
 * No org scoping — these queries deliberately span the entire public-facing
 * catalog. They filter by `roles.publicVisibility != 'private'` and by the
 * current org's published `publicProfile`.
 *
 * See docs/phase-2-public-funnel-spec.md.
 */

import { and, desc, eq, ilike, ne, sql, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { roles, organization } from "@/db/schema";
import type { PublicVisibility } from "@/db/schema/roles";
import {
  publicizeRole,
  type PublicRoleDTO,
} from "@/lib/anonymize";
import type {
  Industry,
  OrgPublicProfile,
  Region,
  Stage,
} from "@/lib/anonymize/taxonomy";
import {
  INDUSTRY_VALUES,
  REGION_VALUES,
  STAGE_VALUES,
} from "@/lib/anonymize/taxonomy";

/* ─────────── Filter contract ─────────── */

export interface PublicListFilters {
  region?: Region | Region[];
  industry?: Industry | Industry[];
  stage?: Stage | Stage[];
  q?: string;
  offset?: number;
  limit?: number;
}

export interface PublicListResult {
  items: PublicRoleDTO[];
  total: number;
  offset: number;
  limit: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/* ─────────── List ─────────── */

export async function listPublicOpportunities(
  filters: PublicListFilters,
): Promise<PublicListResult> {
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = Math.max(0, filters.offset ?? 0);

  // Build conditions
  const conditions = [
    ne(roles.publicVisibility, "private"),
    sql`${roles.publicSlug} IS NOT NULL`,
    sql`${organization.publicProfile} IS NOT NULL`,
  ];

  // Search on title only — broader text search would leak description content
  // before the anonymizer gets to redact it (a public role's description is
  // fine, but anonymized roles never surface description, so don't search it).
  if (filters.q && filters.q.trim()) {
    conditions.push(ilike(roles.title, `%${filters.q.trim()}%`));
  }

  // Bucket filters work on org.publicProfile JSON
  if (filters.region) {
    conditions.push(jsonInFilter(filters.region, REGION_VALUES, "region"));
  }
  if (filters.industry) {
    conditions.push(jsonInFilter(filters.industry, INDUSTRY_VALUES, "industry"));
  }
  if (filters.stage) {
    conditions.push(jsonInFilter(filters.stage, STAGE_VALUES, "stage"));
  }

  const baseQuery = db
    .select({
      role: roles,
      orgName: organization.name,
      orgWebsite: organization.website,
      orgPublicProfile: organization.publicProfile,
    })
    .from(roles)
    .innerJoin(organization, eq(roles.organizationId, organization.id))
    .where(and(...conditions));

  const [rows, countRows] = await Promise.all([
    baseQuery.orderBy(desc(roles.createdAt)).limit(limit).offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(roles)
      .innerJoin(organization, eq(roles.organizationId, organization.id))
      .where(and(...conditions)),
  ]);

  const items = rows
    .map((row) => {
      const profile = row.orgPublicProfile as OrgPublicProfile | null;
      // We already filtered for non-private visibility + non-null slug + non-null
      // profile. But anonymized still requires a profile; double-check.
      const visibility = row.role.publicVisibility as PublicVisibility;
      if (visibility === "private") return null;
      if (visibility === "anonymized" && !profile) return null;
      try {
        return publicizeRole(
          row.role,
          {
            name: row.orgName,
            website: row.orgWebsite,
            publicProfile: profile,
          },
          visibility,
        );
      } catch {
        // A role that fails to publicize (missing slug, missing profile under
        // anonymized) is silently dropped from the public list.
        return null;
      }
    })
    .filter((dto): dto is PublicRoleDTO => dto !== null);

  return {
    items,
    total: countRows[0]?.count ?? 0,
    offset,
    limit,
  };
}

/* ─────────── Detail ─────────── */

export async function getPublicOpportunity(
  slug: string,
  options?: { reveal?: boolean },
): Promise<PublicRoleDTO | null> {
  if (!slug || slug.length < 6) return null;

  const [row] = await db
    .select({
      role: roles,
      orgName: organization.name,
      orgWebsite: organization.website,
      orgPublicProfile: organization.publicProfile,
    })
    .from(roles)
    .innerJoin(organization, eq(roles.organizationId, organization.id))
    .where(and(eq(roles.publicSlug, slug), ne(roles.publicVisibility, "private")))
    .limit(1);

  if (!row) return null;
  const profile = row.orgPublicProfile as OrgPublicProfile | null;
  const visibility = row.role.publicVisibility as PublicVisibility;
  if (visibility === "private") return null;
  if (visibility === "anonymized" && !profile && !options?.reveal) return null;

  // When `reveal` is set (typically because a valid referral token accompanies
  // the request), upgrade an anonymized role to the public DTO. The referrer's
  // social signal substitutes for the k-anonymity gate.
  const effective: Exclude<PublicVisibility, "private"> = options?.reveal
    ? "public"
    : visibility;

  try {
    return publicizeRole(
      row.role,
      {
        name: row.orgName,
        website: row.orgWebsite,
        publicProfile: profile,
      },
      effective,
    );
  } catch {
    return null;
  }
}

/* ─────────── Sitemap ─────────── */

export async function listPublicSlugs(): Promise<
  Array<{ slug: string; updatedAt: Date }>
> {
  const rows = await db
    .select({
      slug: roles.publicSlug,
      updatedAt: roles.updatedAt,
    })
    .from(roles)
    .innerJoin(organization, eq(roles.organizationId, organization.id))
    .where(
      and(
        ne(roles.publicVisibility, "private"),
        sql`${roles.publicSlug} IS NOT NULL`,
        sql`${organization.publicProfile} IS NOT NULL`,
      ),
    );
  return rows
    .filter((r): r is { slug: string; updatedAt: Date } => r.slug !== null)
    .map((r) => ({ slug: r.slug, updatedAt: r.updatedAt }));
}

/* ─────────── helpers ─────────── */

function jsonInFilter(
  value: string | string[],
  allowed: readonly string[],
  key: "industry" | "stage" | "region" | "size",
) {
  const values = Array.isArray(value) ? value : [value];
  // Drop any out-of-vocabulary inputs — never trust user input on the public
  // surface. The allowed set comes from the controlled taxonomy.
  const clean = values.filter((v) => allowed.includes(v));
  if (clean.length === 0) {
    // User asked for a filter that maps to nothing → match nothing.
    return sql`FALSE`;
  }
  return sql`${organization.publicProfile}->>${sql.raw(`'${key}'`)} = ANY(${clean})`;
}
