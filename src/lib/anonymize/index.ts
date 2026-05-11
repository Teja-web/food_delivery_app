/**
 * Public-DTO transformer for the /opportunities surface.
 *
 * **Security boundary.** Every field that crosses the unauthenticated edge
 * goes through `publicizeRole`. The accompanying test suite at
 * `tests/anonymize.test.ts` snapshot-asserts every redaction; adding a new
 * public field requires updating the snapshot. Do NOT bypass this function
 * for unauthenticated callers.
 *
 * See docs/phase-2-public-funnel-spec.md.
 */

import type { Role, RoleCompensation, PublicVisibility } from "@/db/schema/roles";
import {
  composePublicLabel,
  type Industry,
  type OrgPublicProfile,
  type Region,
  type Stage,
  type SizeBucket,
} from "./taxonomy";

/* ─────────── Types ─────────── */

export type Level = "junior" | "mid" | "senior" | "lead" | "principal";

export interface AnonymizedRoleDTO {
  visibility: "anonymized";
  slug: string;
  title: string;
  publicLabel: string;
  industry: Industry;
  stage: Stage;
  region: Region;
  size: SizeBucket | null;
  compBand: string | null;
  level: Level;
  employmentType: string | null;
  skills: string[];
  summary: string | null;
  postedAt: string;
}

export interface PublicRoleFullDTO {
  visibility: "public";
  slug: string;
  title: string;
  orgName: string | null;
  orgWebsite: string | null;
  description: string | null;
  team: string | null;
  department: string | null;
  location: string | null;
  comp: RoleCompensation | null;
  employmentType: string | null;
  skills: string[];
  postedAt: string;
}

export type PublicRoleDTO = AnonymizedRoleDTO | PublicRoleFullDTO;

/**
 * Subset of the `auth.organization` row we need. Defined narrowly so the
 * function can be called with partial fixture data in tests without faking
 * the full ORM row.
 */
export interface OrgRow {
  name: string | null;
  website: string | null;
  publicProfile: OrgPublicProfile | null;
}

/* ─────────── The transformer ─────────── */

/**
 * Build the public DTO for a role. The visibility mode comes from the
 * caller (typically `role.publicVisibility`). For `anonymized` the org's
 * `publicProfile` must be set; the function throws otherwise to fail
 * loud — the caller (e.g. the listing endpoint) should pre-filter.
 *
 * For `private` callers, simply do not call this function — the role is
 * not for public consumption.
 */
export function publicizeRole(
  role: Pick<
    Role,
    | "title"
    | "team"
    | "department"
    | "location"
    | "compensation"
    | "description"
    | "criteriaConfig"
    | "employmentType"
    | "publicVisibility"
    | "publicSlug"
    | "createdAt"
  >,
  org: OrgRow,
  mode: Exclude<PublicVisibility, "private">,
): PublicRoleDTO {
  if (!role.publicSlug) {
    throw new Error("Role missing publicSlug; was setRolePublicVisibility called?");
  }

  const skills = extractSkills(role.criteriaConfig);
  const postedAt =
    role.createdAt instanceof Date
      ? role.createdAt.toISOString()
      : new Date(role.createdAt as unknown as string).toISOString();

  if (mode === "public") {
    return {
      visibility: "public",
      slug: role.publicSlug,
      title: role.title,
      orgName: org.name ?? null,
      orgWebsite: org.website ?? null,
      description: cleanDescription(role.description),
      team: role.team ?? null,
      department: role.department ?? null,
      location: role.location ?? null,
      comp: (role.compensation as RoleCompensation | null) ?? null,
      employmentType: role.employmentType ?? null,
      skills,
      postedAt,
    };
  }

  // mode === "anonymized"
  if (!org.publicProfile) {
    throw new Error(
      "Cannot anonymize role: org has no publicProfile. Caller must filter first.",
    );
  }

  const profile = org.publicProfile;
  const level = deriveLevel(role.title);
  const country = regionCountry(profile.region);
  const compBand = bandComp(role.compensation as RoleCompensation | null, country, level);

  return {
    visibility: "anonymized",
    slug: role.publicSlug,
    title: role.title,
    publicLabel: composePublicLabel(profile),
    industry: profile.industry,
    stage: profile.stage,
    region: profile.region,
    size: profile.size,
    compBand,
    level,
    employmentType: role.employmentType ?? null,
    skills: skills.slice(0, 8),
    summary: null,
    postedAt,
  };
}

/* ─────────── Helpers ─────────── */

export function deriveLevel(title: string): Level {
  const t = title.toLowerCase();
  if (/\b(principal|distinguished|fellow)\b/.test(t)) return "principal";
  if (/\b(staff|lead|manager|head of|director|vp|chief)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|intern|associate|graduate|entry)\b/.test(t)) return "junior";
  return "mid";
}

export type Country = "us" | "in" | "eu" | "global";

export function regionCountry(region: Region): Country {
  if (
    [
      "bay_area",
      "nyc_metro",
      "los_angeles",
      "boston",
      "seattle",
      "austin",
      "chicago",
      "other_us",
      "remote_us",
    ].includes(region)
  ) {
    return "us";
  }
  if (
    [
      "bengaluru",
      "mumbai",
      "delhi_ncr",
      "hyderabad",
      "chennai",
      "pune",
      "other_in",
      "remote_in",
    ].includes(region)
  ) {
    return "in";
  }
  if (
    ["london", "berlin", "amsterdam", "paris", "other_eu", "remote_eu"].includes(region)
  ) {
    return "eu";
  }
  return "global";
}

/* ─────────── Comp banding ───────────
 *
 * Bands from docs/phase-2-public-funnel-spec.md. Roles with no comp data,
 * or whose midpoint falls outside the table, get a sensible string fallback
 * or null.
 */

interface Band {
  lo: number;
  hi: number;
  label: string;
}

const BANDS: Record<Country, Record<Level, Band[]>> = {
  us: {
    junior: [
      { lo: 80, hi: 100, label: "$80-100k" },
      { lo: 100, hi: 120, label: "$100-120k" },
    ],
    mid: [
      { lo: 120, hi: 150, label: "$120-150k" },
      { lo: 150, hi: 180, label: "$150-180k" },
    ],
    senior: [
      { lo: 180, hi: 220, label: "$180-220k" },
      { lo: 220, hi: 260, label: "$220-260k" },
    ],
    lead: [
      { lo: 260, hi: 310, label: "$260-310k" },
      { lo: 310, hi: 360, label: "$310-360k" },
    ],
    principal: [
      { lo: 360, hi: 450, label: "$360-450k" },
      { lo: 450, hi: Infinity, label: "$450k+" },
    ],
  },
  in: {
    junior: [
      { lo: 6, hi: 10, label: "₹6-10 LPA" },
      { lo: 10, hi: 15, label: "₹10-15 LPA" },
    ],
    mid: [
      { lo: 15, hi: 25, label: "₹15-25 LPA" },
      { lo: 25, hi: 40, label: "₹25-40 LPA" },
    ],
    senior: [
      { lo: 40, hi: 60, label: "₹40-60 LPA" },
      { lo: 60, hi: 90, label: "₹60-90 LPA" },
    ],
    lead: [
      { lo: 90, hi: 130, label: "₹90-130 LPA" },
      { lo: 130, hi: 180, label: "₹130-180 LPA" },
    ],
    principal: [
      { lo: 180, hi: 250, label: "₹180-250 LPA" },
      { lo: 250, hi: Infinity, label: "₹250 LPA+" },
    ],
  },
  eu: {
    junior: [
      { lo: 50, hi: 65, label: "€50-65k" },
      { lo: 65, hi: 80, label: "€65-80k" },
    ],
    mid: [
      { lo: 80, hi: 100, label: "€80-100k" },
      { lo: 100, hi: 130, label: "€100-130k" },
    ],
    senior: [
      { lo: 130, hi: 160, label: "€130-160k" },
      { lo: 160, hi: 200, label: "€160-200k" },
    ],
    lead: [
      { lo: 200, hi: 240, label: "€200-240k" },
      { lo: 240, hi: 300, label: "€240-300k" },
    ],
    principal: [
      { lo: 300, hi: 380, label: "€300-380k" },
      { lo: 380, hi: Infinity, label: "€380k+" },
    ],
  },
  global: {
    // Fallback: same as US bands rendered in USD.
    junior: [
      { lo: 80, hi: 100, label: "$80-100k" },
      { lo: 100, hi: 120, label: "$100-120k" },
    ],
    mid: [
      { lo: 120, hi: 150, label: "$120-150k" },
      { lo: 150, hi: 180, label: "$150-180k" },
    ],
    senior: [
      { lo: 180, hi: 220, label: "$180-220k" },
      { lo: 220, hi: 260, label: "$220-260k" },
    ],
    lead: [
      { lo: 260, hi: 310, label: "$260-310k" },
      { lo: 310, hi: 360, label: "$310-360k" },
    ],
    principal: [
      { lo: 360, hi: 450, label: "$360-450k" },
      { lo: 450, hi: Infinity, label: "$450k+" },
    ],
  },
};

/**
 * Convert a role's exact comp into a banded string. Mid-point of the role's
 * (min, max) decides the band; if comp is not disclosed, returns null.
 *
 * Comp values are interpreted in *thousands* for US/EU (so 120 = $120k) and
 * in LPA for India (so 12 = ₹12 LPA). Storage convention follows what
 * `RoleCompensation` already does in this codebase.
 */
export function bandComp(
  comp: RoleCompensation | null,
  country: Country,
  level: Level,
): string | null {
  if (!comp || (comp.min == null && comp.max == null)) return null;
  const min = comp.min ?? comp.max ?? 0;
  const max = comp.max ?? comp.min ?? 0;
  const mid = (min + max) / 2;
  const bands = BANDS[country][level];
  const band = bands.find((b) => mid >= b.lo && mid < b.hi);
  if (band) return band.label;
  // Outside the table — coarse fallback by clamping to the last band.
  const last = bands[bands.length - 1]!;
  if (mid >= last.lo) return last.label;
  return null;
}

/* ─────────── Description / skills ─────────── */

function cleanDescription(raw: string | null): string | null {
  if (!raw) return null;
  // Strip any HTML; trim; cap at ~2000 chars for the public surface.
  const stripped = raw.replace(/<[^>]+>/g, "").trim();
  return stripped.length > 2000 ? stripped.slice(0, 2000) + "…" : stripped;
}

function extractSkills(criteriaConfig: unknown): string[] {
  if (!criteriaConfig || typeof criteriaConfig !== "object") return [];
  const cfg = criteriaConfig as Record<string, unknown>;
  const keywords = cfg.keywords as
    | Array<{ term?: string; importance?: string; category?: string }>
    | undefined;
  if (!Array.isArray(keywords)) return [];
  // Critical + important skill keywords only; cap at 10. The DTO further
  // truncates to 8 in anonymized mode.
  return keywords
    .filter(
      (k) =>
        typeof k.term === "string" &&
        (k.importance === "critical" || k.importance === "important"),
    )
    .map((k) => k.term as string)
    .slice(0, 10);
}
