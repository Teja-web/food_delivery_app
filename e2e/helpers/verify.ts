/**
 * Data verification helpers for e2e tests.
 *
 * Queries the database directly (via pg) to verify data chains
 * after each journey step — no test API routes needed.
 */

import "dotenv/config";
import pg from "pg";
import { expect } from "@playwright/test";

const { Pool } = pg;

// Lazy-init pool — reused across all verify calls in a test run
let pool: InstanceType<typeof Pool> | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30_000,
    });
    // Set search_path so unqualified table names resolve to coznt schema
    pool.on("connect", (client) => {
      client.query("SET search_path TO coznt, public");
    });
  }
  return pool;
}

export async function query<T = Record<string, any>>(sql: string, params: any[] = []): Promise<T[]> {
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}

async function queryOne<T = Record<string, any>>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Poll a query until it returns a non-null result. */
async function queryWithRetry<T = Record<string, any>>(
  sql: string,
  params: any[] = [],
  { retries = 15, delayMs = 2000 } = {},
): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    const row = await queryOne<T>(sql, params);
    if (row != null) return row;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

// -- URL Helpers ----------------------------------------------------------

const BASE_URL = "http://localhost:3029";

/** Extract the last path segment as the entity ID from a URL. */
export function extractId(url: string): string {
  const pathname = new URL(url, BASE_URL).pathname;
  const segments = pathname.split("/").filter(Boolean);
  return segments[segments.length - 1]!;
}

// -- Recruiter Journey Verifiers ------------------------------------------

/** Verify role data chain is complete after intake DAG. */
export async function verifyRoleData(
  _request: unknown,
  roleId: string,
  expected: {
    hasCompensation?: boolean;
    hasCriteria?: boolean;
    status?: string;
  } = {},
) {
  const role = await queryOne("SELECT * FROM roles WHERE id = $1", [roleId]);
  expect(role, `Role ${roleId} should exist`).not.toBeNull();

  if (expected.hasCompensation) {
    expect(role!.compensation, "Role should have compensation").toBeTruthy();
  }
  if (expected.hasCriteria) {
    const config = typeof role!.criteria_config === "string"
      ? JSON.parse(role!.criteria_config)
      : role!.criteria_config;
    expect(config?.criteria?.length, "Role should have criteria").toBeGreaterThan(0);
  }
  if (expected.status) {
    expect(role!.status).toBe(expected.status);
  }
  expect(role!.description, "Role should have description").toBeTruthy();
  return role;
}

/** Verify AI extraction produced phone, location, and skills from a candidate's resume. */
export async function verifyCandidateExtraction(
  _request: unknown,
  candidateId: string,
  expected: {
    phone?: RegExp | null;
    location?: RegExp | null;
    skills?: { min: number };
  } = {},
) {
  const candidate = await queryOne("SELECT * FROM candidates WHERE id = $1", [candidateId]);
  expect(candidate, `Candidate ${candidateId} should exist`).not.toBeNull();

  if (expected.phone !== undefined) {
    if (expected.phone === null) {
      expect(candidate!.phone, "Candidate phone should be extracted").toBeTruthy();
    } else {
      expect(candidate!.phone, "Candidate phone should match pattern").toMatch(expected.phone);
    }
  }

  if (expected.location !== undefined) {
    if (expected.location === null) {
      expect(candidate!.location, "Candidate location should be extracted").toBeTruthy();
    } else {
      expect(candidate!.location, "Candidate location should match pattern").toMatch(expected.location);
    }
  }

  if (expected.skills) {
    const intel = await queryWithRetry(
      "SELECT * FROM candidate_intelligence WHERE candidate_id = $1",
      [candidateId],
    );
    expect(intel, "Candidate intelligence should exist").not.toBeNull();
    expect(intel!.profile, "Intelligence profile should exist").toBeTruthy();

    const profile = typeof intel!.profile === "string" ? JSON.parse(intel!.profile) : intel!.profile;
    const skills = profile?.skills || profile?.technicalSkills || [];
    expect(
      Array.isArray(skills) ? skills.length : 0,
      `Should have at least ${expected.skills.min} skills`,
    ).toBeGreaterThanOrEqual(expected.skills.min);
  }

  return candidate;
}

/** Verify candidate intelligence (profile + talent assessment) exists. */
export async function verifyCandidateIntelligence(
  _request: unknown,
  candidateId: string,
  expected: {
    hasProfile?: boolean;
    hasTalentScore?: boolean;
  } = {},
) {
  // Build a query that waits for the specific fields we expect
  const conditions = ["candidate_id = $1"];
  if (expected.hasProfile) conditions.push("profile IS NOT NULL");
  if (expected.hasTalentScore) conditions.push("talent_assessment IS NOT NULL");

  const intel = await queryWithRetry(
    `SELECT * FROM candidate_intelligence WHERE ${conditions.join(" AND ")}`,
    [candidateId],
  );
  expect(intel, "Candidate intelligence should exist with expected fields").not.toBeNull();

  return intel;
}

/** Verify matches were created for a role with expected quality. */
export async function verifyMatchesForRole(
  _request: unknown,
  roleId: string,
  expected: {
    minCount?: number;
    minFitScore?: number;
    hasAlignment?: boolean;
    hasRecommendation?: boolean;
  } = {},
) {
  // Poll until matches appear (matching is async via the worker)
  const minCount = expected.minCount ?? 1;
  let matches: Record<string, any>[] = [];
  for (let i = 0; i < 50; i++) {
    matches = await query(
      `SELECT * FROM matches
       WHERE role_id = $1
       ORDER BY fit_score DESC NULLS LAST`,
      [roleId],
    );
    if (matches.length >= minCount) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (expected.minCount !== undefined) {
    expect(
      matches.length,
      `Role should have at least ${expected.minCount} matches`,
    ).toBeGreaterThanOrEqual(expected.minCount);
  }

  if (matches.length > 0) {
    const bestMatch = matches[0];

    if (expected.minFitScore !== undefined) {
      const maxFit = Math.max(...matches.map((m) => m.fit_score ?? 0));
      expect(maxFit, `Best fit score should be >= ${expected.minFitScore}`).toBeGreaterThanOrEqual(
        expected.minFitScore,
      );
    }
    if (expected.hasAlignment) {
      expect(bestMatch.alignment, "Match should have alignment data").toBeTruthy();
      const alignment =
        typeof bestMatch.alignment === "string"
          ? JSON.parse(bestMatch.alignment)
          : bestMatch.alignment;
      expect(Array.isArray(alignment) ? alignment.length : 0, "Alignment should have entries").toBeGreaterThan(0);
    }
    if (expected.hasRecommendation) {
      expect(bestMatch.recommendation, "Match should have recommendation").toBeTruthy();
    }
  }

  return { matches };
}

/** Verify interview data chain: prep, slots, scorecards. */
export async function verifyInterviewData(
  _request: unknown,
  interviewId: string,
  expected: {
    hasFocusAreas?: boolean;
    focusAreasMin?: number;
    slotsCount?: number;
    scorecardCount?: number;
    scorecardReviewer?: RegExp;
  } = {},
) {
  const interview = await queryOne("SELECT * FROM interviews WHERE id = $1", [interviewId]);
  expect(interview, `Interview ${interviewId} should exist`).not.toBeNull();

  if (expected.hasFocusAreas || expected.focusAreasMin) {
    const intel = await queryOne(
      "SELECT * FROM interview_intelligence WHERE interview_id = $1",
      [interviewId],
    );
    expect(intel, "Interview intelligence should exist").not.toBeNull();
    expect(intel!.prep, "Interview prep should be populated").toBeTruthy();

    const prep = typeof intel!.prep === "string" ? JSON.parse(intel!.prep) : intel!.prep;
    if (expected.focusAreasMin !== undefined) {
      const areas = prep?.focusAreas || prep?.focus_areas || [];
      expect(
        Array.isArray(areas) ? areas.length : 0,
        `Should have at least ${expected.focusAreasMin} focus areas`,
      ).toBeGreaterThanOrEqual(expected.focusAreasMin);
    }
  }

  if (expected.slotsCount !== undefined) {
    const slots = typeof interview!.proposed_slots === "string"
      ? JSON.parse(interview!.proposed_slots)
      : interview!.proposed_slots ?? [];
    expect(
      Array.isArray(slots) ? slots.length : 0,
      `Should have ${expected.slotsCount} proposed slots`,
    ).toBe(expected.slotsCount);
  }

  if (expected.scorecardCount !== undefined) {
    const cards = await query(
      "SELECT * FROM interview_scorecards WHERE interview_id = $1",
      [interviewId],
    );
    expect(
      cards.length,
      `Should have ${expected.scorecardCount} scorecards`,
    ).toBeGreaterThanOrEqual(expected.scorecardCount);

    if (expected.scorecardReviewer && cards.length > 0) {
      const reviewer = cards[0].reviewer_name || cards[0].created_by_name;
      expect(reviewer, "Scorecard should have a reviewer name").toBeTruthy();
      expect(reviewer).toMatch(expected.scorecardReviewer);
    }
  }

  return interview;
}

/** Verify activity feed has entries for an entity. */
export async function verifyActivity(
  _request: unknown,
  entityType: string,
  entityId: string,
  expected: {
    minEntries?: number;
  } = {},
) {
  const entries = await query(
    "SELECT * FROM automation_logs WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC",
    [entityType, entityId],
  );

  if (expected.minEntries !== undefined) {
    expect(
      entries.length,
      `Should have at least ${expected.minEntries} activity entries`,
    ).toBeGreaterThanOrEqual(expected.minEntries);
  }

  return entries;
}

/** Verify pool has members matching expectations. */
export async function verifyPoolMembers(
  _request: unknown,
  poolId: string,
  expected: {
    minCount?: number;
    hasCandidateId?: string;
  } = {},
) {
  const members = await query(
    "SELECT * FROM pool_members WHERE pool_id = $1",
    [poolId],
  );

  if (expected.minCount !== undefined) {
    expect(
      members.length,
      `Pool should have at least ${expected.minCount} members`,
    ).toBeGreaterThanOrEqual(expected.minCount);
  }

  if (expected.hasCandidateId) {
    const candidateIds = members.map((m) => m.candidate_id);
    expect(
      candidateIds,
      `Pool should contain candidate ${expected.hasCandidateId}`,
    ).toContain(expected.hasCandidateId);
  }

  return members;
}

/** Verify insights have real data after the full journey. */
export async function verifyInsights(
  _request: unknown,
  expected: {
    pipelineActive?: { min: number };
    openRoles?: { min: number };
  } = {},
) {
  // Pipeline health: count active applications
  if (expected.pipelineActive) {
    const [result] = await query(
      "SELECT COUNT(*)::int as count FROM applications WHERE stage NOT IN ('rejected', 'withdrawn', 'hired')",
    );
    expect(
      result.count,
      `Should have at least ${expected.pipelineActive.min} active pipeline entries`,
    ).toBeGreaterThanOrEqual(expected.pipelineActive.min);
  }

  return { verified: true };
}

/** Verify engagements (emails, messages) exist for a candidate. */
export async function verifyEngagements(
  _request: unknown,
  candidateId: string,
  expected: {
    minCount?: number;
    hasType?: string;
  } = {},
) {
  const items = await query(
    "SELECT * FROM engagements WHERE recipient_id = $1",
    [candidateId],
  );

  if (expected.minCount !== undefined) {
    expect(
      items.length,
      `Should have at least ${expected.minCount} engagements`,
    ).toBeGreaterThanOrEqual(expected.minCount);
  }

  if (expected.hasType && items.length > 0) {
    const types = items.map((e) => e.type);
    expect(
      types.some((t: string) => t?.includes(expected.hasType!)),
      `Should have engagement of type containing "${expected.hasType}"`,
    ).toBeTruthy();
  }

  return items;
}

/** Verify offer intelligence chain. */
export async function verifyOfferIntelligence(
  _request: unknown,
  offerId: string,
  expected: {
    hasCloseAnalysis?: boolean;
    hasLeverageAnalysis?: boolean;
  } = {},
) {
  const intel = await queryOne(
    "SELECT * FROM offer_intelligence WHERE offer_id = $1",
    [offerId],
  );

  if (expected.hasCloseAnalysis) {
    expect(intel, "Offer intelligence should exist").not.toBeNull();
    expect(intel!.close_analysis, "Should have close analysis").toBeTruthy();
  }

  if (expected.hasLeverageAnalysis) {
    expect(intel, "Offer intelligence should exist").not.toBeNull();
    expect(intel!.leverage_analysis, "Should have leverage analysis").toBeTruthy();
    const la = intel!.leverage_analysis as any;
    expect(la.leverageScore).toBeGreaterThanOrEqual(0);
    expect(la.leverageScore).toBeLessThanOrEqual(100);
    expect(["aggressive_open", "market_rate", "premium_required"]).toContain(la.negotiationStrategy);
  }

  return intel;
}

/** Verify offer version chain. */
export async function verifyOfferVersions(
  _request: unknown,
  offerId: string,
  expected: {
    minVersions?: number;
    latestTrigger?: string;
    hasRiskFlags?: boolean;
  } = {},
) {
  const versions = await query(
    "SELECT * FROM offer_versions WHERE offer_id = $1 ORDER BY version_number",
    [offerId],
  );

  if (expected.minVersions) {
    expect(versions.length, `Should have at least ${expected.minVersions} version(s)`).toBeGreaterThanOrEqual(expected.minVersions);
  }

  if (expected.latestTrigger && versions.length > 0) {
    const latest = versions[versions.length - 1]!;
    expect(latest.trigger_type, "Latest version trigger type").toBe(expected.latestTrigger);
  }

  if (expected.hasRiskFlags && versions.length > 0) {
    const latest = versions[versions.length - 1]!;
    expect(latest.risk_flags, "Latest version should have risk flags").toBeTruthy();
    const rf = latest.risk_flags as any;
    expect(["within", "stretched", "out-of-band"]).toContain(rf.bandCompliance);
    expect(["low", "medium", "high"]).toContain(rf.parityRisk);
  }

  return versions;
}

/** Verify offer status and decline reason. */
export async function verifyOfferStatus(
  _request: unknown,
  offerId: string,
  expected: {
    status?: string;
    hasDeclineReason?: boolean;
    declineReasonType?: string;
    currentVersionId?: boolean;
  } = {},
) {
  const offer = await queryOne("SELECT * FROM offers WHERE id = $1", [offerId]);
  expect(offer, `Offer ${offerId} should exist`).not.toBeNull();

  if (expected.status) {
    expect(offer!.status, "Offer status").toBe(expected.status);
  }

  if (expected.hasDeclineReason) {
    expect(offer!.decline_reason, "Should have decline reason").toBeTruthy();
    if (expected.declineReasonType) {
      const dr = offer!.decline_reason as any;
      expect(dr.reason, "Decline reason type").toBe(expected.declineReasonType);
    }
  }

  if (expected.currentVersionId) {
    expect(offer!.current_version_id, "Should have current version ID").toBeTruthy();
  }

  return offer;
}

/** Wait for an offer to be created for an application. */
export async function waitForOffer(applicationId: string) {
  return queryWithRetry<any>(
    "SELECT * FROM offers WHERE application_id = $1",
    [applicationId],
    { retries: 20, delayMs: 2000 },
  );
}

/** Wait for offer versions to reach a count. */
export async function waitForOfferVersion(offerId: string, minVersions: number = 1) {
  return queryWithRetry<any>(
    `SELECT * FROM offer_versions WHERE offer_id = $1 AND version_number >= $2 ORDER BY version_number DESC LIMIT 1`,
    [offerId, minVersions],
    { retries: 20, delayMs: 2000 },
  );
}

/** Legacy compat — fetch raw entity data by type. */
export async function fetchEntity(
  _request: unknown,
  entity: string,
  params: Record<string, string> = {},
): Promise<any> {
  const id = params.id;
  switch (entity) {
    case "candidate":
      return queryOne("SELECT * FROM candidates WHERE id = $1", [id]);
    case "roleDetail":
      return queryOne("SELECT * FROM roles WHERE id = $1", [id]);
    case "interview":
      return queryOne("SELECT * FROM interviews WHERE id = $1", [id]);
    case "candidateIntel":
      return queryOne("SELECT * FROM candidate_intelligence WHERE candidate_id = $1", [id]);
    case "interviewIntel":
      return queryOne("SELECT * FROM interview_intelligence WHERE interview_id = $1", [id]);
    case "offerDetail":
      return queryOne("SELECT * FROM offers WHERE id = $1", [id]);
    case "offerIntel":
      return queryOne("SELECT * FROM offer_intelligence WHERE offer_id = $1", [id]);
    case "insights":
      return { verified: true };
    case "activity":
      return query(
        "SELECT * FROM automation_logs WHERE entity_type = $1 AND entity_id = $2",
        [params.entityType, params.entityId],
      );
    case "poolMembers":
      return query("SELECT * FROM pool_members WHERE pool_id = $1", [id]);
    case "engagements":
      return query("SELECT * FROM engagements WHERE recipient_id = $1", [id]);
    default:
      throw new Error(`Unknown entity: ${entity}`);
  }
}
