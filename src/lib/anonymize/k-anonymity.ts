/**
 * K-anonymity bucket counting for the public opportunity listings.
 *
 * Rule (from docs/phase-2-public-funnel-spec.md):
 *   A `(industry, stage, size, region)` quadruple in our org population must
 *   contain ≥3 orgs before any role with that quadruple may be `anonymized`.
 *
 * If the quadruple is below the floor, the caller falls back to a coarser
 * bucket: drop `size`, then drop `region` to a country-level bucket. If
 * still below, anonymization is not available — the role can only be
 * `private` or `public`.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { regionCountry, type Country } from "./index";
import type { OrgPublicProfile } from "./taxonomy";

export const K_ANONYMITY_FLOOR = 3;

export type BucketLevel =
  | { level: "full"; count: number; ok: boolean }
  | { level: "no-size"; count: number; ok: boolean }
  | { level: "no-region"; count: number; ok: boolean }
  | { level: "blocked"; count: number; ok: false };

/**
 * Returns the count of orgs in this org's quadruple bucket, with progressive
 * coarsening if below the floor. The caller decides what to do — typically:
 *  - `full` & ok → render with all four facets
 *  - `no-size` & ok → render without the size facet
 *  - `no-region` & ok → render with a country-level region instead
 *  - `blocked` → don't allow anonymization
 */
export async function bucketSize(profile: OrgPublicProfile): Promise<BucketLevel> {
  const full = await countOrgs({
    industry: profile.industry,
    stage: profile.stage,
    size: profile.size,
    region: profile.region,
  });
  if (full >= K_ANONYMITY_FLOOR) {
    return { level: "full", count: full, ok: true };
  }

  const noSize = await countOrgs({
    industry: profile.industry,
    stage: profile.stage,
    region: profile.region,
  });
  if (noSize >= K_ANONYMITY_FLOOR) {
    return { level: "no-size", count: noSize, ok: true };
  }

  const country = regionCountry(profile.region);
  const noRegion = await countOrgs({
    industry: profile.industry,
    stage: profile.stage,
    regionCountryPrefix: country,
  });
  if (noRegion >= K_ANONYMITY_FLOOR) {
    return { level: "no-region", count: noRegion, ok: true };
  }

  return { level: "blocked", count: full, ok: false };
}

async function countOrgs(filters: {
  industry: string;
  stage: string;
  size?: string;
  region?: string;
  regionCountryPrefix?: Country;
}): Promise<number> {
  const conditions = [
    sql`public_profile->>'industry' = ${filters.industry}`,
    sql`public_profile->>'stage' = ${filters.stage}`,
  ];
  if (filters.size) {
    conditions.push(sql`public_profile->>'size' = ${filters.size}`);
  }
  if (filters.region) {
    conditions.push(sql`public_profile->>'region' = ${filters.region}`);
  }
  if (filters.regionCountryPrefix) {
    conditions.push(
      sql`public_profile->>'region' = ANY(${countryRegions(filters.regionCountryPrefix)})`,
    );
  }

  const where = conditions.reduce((acc, c, i) =>
    i === 0 ? c : sql`${acc} AND ${c}`,
  );

  const result = await db.execute<{ count: number }>(sql`
    SELECT COUNT(DISTINCT id)::int AS count
    FROM auth.organization
    WHERE public_profile IS NOT NULL AND ${where}
  `);
  const row = (result as unknown as Array<{ count: number }>)[0];
  return row?.count ?? 0;
}

function countryRegions(country: Country): string[] {
  switch (country) {
    case "us":
      return [
        "bay_area",
        "nyc_metro",
        "los_angeles",
        "boston",
        "seattle",
        "austin",
        "chicago",
        "other_us",
        "remote_us",
      ];
    case "in":
      return [
        "bengaluru",
        "mumbai",
        "delhi_ncr",
        "hyderabad",
        "chennai",
        "pune",
        "other_in",
        "remote_in",
      ];
    case "eu":
      return ["london", "berlin", "amsterdam", "paris", "other_eu", "remote_eu"];
    case "global":
      return ["remote_global", "other"];
  }
}
