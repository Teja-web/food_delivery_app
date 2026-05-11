import { createEntityCrud } from "@/lib/crud";
import { db } from "@/db/client";
import { candidates, orgCandidates, applications, roles, candidateIntelligence } from "@/db/schema";
import { candidateSchema } from "./schemas";
import { getActionContext, isWorkerContext } from "@/lib/auth/context";
import { eq, and, sql } from "drizzle-orm";
import type { TalentAssessment, InterviewEvaluation, AssessmentEvaluation } from "@/db/schema/intelligence";
import type { CandidateExperience, CandidateEducation } from "@/db/schema/candidates";
import { safeRevalidate } from "@/lib/safe-revalidate";

/* -- Candidate context builder --------------------------------------- */

function buildCandidateContext(c: any): string {
  const sections: string[] = [];

  // Header
  const header = [`## Candidate: ${c.name}`];
  if (c.title || c.company) {
    header.push([c.title, c.company].filter(Boolean).join(" at "));
  }
  if (c.location) header.push(`Location: ${c.location}`);
  sections.push(header.join("\n"));

  // Profile summary (prefer intelligence, fall back to raw profile)
  const intelProfile = c.intelligence?.profile;
  const rawProfile = c.profile as Record<string, unknown> | null;
  const summary = intelProfile?.summary ?? (rawProfile?.summary as string | undefined);
  if (summary) sections.push(summary);

  // Skills
  const skills = c.skills as string[] | null;
  if (skills?.length) sections.push(`Skills: ${skills.join(", ")}`);

  // Experience
  const experience = c.experience as CandidateExperience[] | null;
  if (experience?.length) {
    const lines = experience.map((e) => {
      const dates = e.startDate ? ` (${e.startDate}–${e.endDate ?? "Present"})` : "";
      const desc = e.description ? `: ${e.description}` : "";
      return `- ${e.title} at ${e.company}${dates}${desc}`;
    });
    sections.push(`### Experience\n${lines.join("\n")}`);
  }

  // Education
  const education = c.education as CandidateEducation[] | null;
  if (education?.length) {
    const lines = education.map((e) => {
      const field = e.field ? ` in ${e.field}` : "";
      const year = e.year ? ` (${e.year})` : "";
      return `- ${e.degree}${field} from ${e.institution}${year}`;
    });
    sections.push(`### Education\n${lines.join("\n")}`);
  }

  // Talent assessment (from intelligence)
  const talentAssessment = c.intelligence?.talentAssessment as TalentAssessment | null;
  if (talentAssessment) {
    const lines: string[] = [];
    lines.push(`Rating: ${talentAssessment.rating} | Outlook: ${talentAssessment.outlook} | Confidence: ${talentAssessment.confidence}`);
    lines.push(`Role Family: ${talentAssessment.roleFamily}`);
    if (talentAssessment.pillars?.length) {
      lines.push("Pillars:");
      for (const p of talentAssessment.pillars) {
        const signalSummary = p.signals?.length ? ` — ${p.signals.slice(0, 2).join("; ")}` : "";
        lines.push(`  - ${p.pillar}: ${p.score}/100 (weight: ${p.weight})${signalSummary}`);
      }
    }
    if (talentAssessment.gaps?.length) {
      lines.push("Gaps to validate:");
      for (const gap of talentAssessment.gaps) lines.push(`  - ${gap}`);
    }
    sections.push(`### Talent Assessment\n${lines.join("\n")}`);
  }

  // Interview evidence (from applications → interviews → intelligence)
  const interviewBlocks: string[] = [];
  for (const app of c.applications ?? []) {
    const roleName = app.role?.title;
    for (const interview of app.interviews ?? []) {
      const ev = interview.intelligence?.evaluation as InterviewEvaluation | null;
      if (!ev) continue;
      const type = interview.interviewType ?? "Interview";
      const label = roleName ? `${type} (for ${roleName})` : type;
      const lines: string[] = [`${label}:`];

      // Front-load panel health and dimension scores — these are the most important signals
      if (ev.panelHealth) lines.push(`  ⚑ Panel Health: ${ev.panelHealth.toUpperCase()} | Evidence Coverage: ${Math.round(ev.evidenceCoverage * 100)}%`);

      // Competency alignment from scorecards (reviewer feedback)
      if (ev.alignmentByCompetency?.length) {
        lines.push("  Reviewer Feedback:");
        for (const a of ev.alignmentByCompetency) {
          lines.push(`    - ${a.competency}: ${a.score}/100 (${a.panelAgreement}) — ${a.evidence}`);
        }
      }
      // Competency scores deduced from transcript
      if (ev.transcriptCompetencyScores?.length) {
        const scores = ev.transcriptCompetencyScores.map((cs) =>
          `${cs.competency}: ${cs.score}/10${cs.score <= 3 ? " [CRITICAL]" : ""}`
        );
        lines.push(`  Deduced from Transcript: ${scores.join(" | ")}`);
      }

      // Red flags immediately after scores
      if (ev.redFlags?.length) lines.push(`  ⚠ Red Flags: ${ev.redFlags.join("; ")}`);

      if (ev.assessmentParagraph) lines.push(`  Summary: ${ev.assessmentParagraph}`);
      if (ev.topicsDiscussed?.length) lines.push(`  Topics: ${ev.topicsDiscussed.join(", ")}`);
      if (ev.standoutMoments?.length) lines.push(`  Standout: ${ev.standoutMoments.join("; ")}`);
      if (ev.consensus) lines.push(`  Consensus: ${ev.consensus}`);
      interviewBlocks.push(lines.join("\n"));
    }
  }
  if (interviewBlocks.length) {
    sections.push(`### Interview Evidence (OBSERVED — overrides resume claims)\n${interviewBlocks.join("\n\n")}`);
  }

  // Assessment results (from applications → assessmentAttempts → intelligence)
  const assessmentBlocks: string[] = [];
  for (const app of c.applications ?? []) {
    const roleName = app.role?.title;
    for (const attempt of app.assessmentAttempts ?? []) {
      const ev = attempt.intelligence?.evaluation as AssessmentEvaluation | null;
      if (!ev) continue;
      const name = attempt.assessment?.title ?? attempt.assessment?.type ?? "Assessment";
      const type = attempt.assessment?.type ?? "";
      const roleLabel = roleName ? ` [for ${roleName}]` : "";
      const lines: string[] = [`${name}${type ? ` (${type})` : ""}${roleLabel}:`];
      lines.push(`  Score: ${ev.score}/100 (raw: ${ev.rawScore}/${ev.totalPoints})`);
      // Include criteria breakdown if available in details
      const details = ev.details as Record<string, unknown> | null;
      if (details) {
        const entries = Object.entries(details).filter(([, v]) => v != null);
        if (entries.length) {
          const formatted = entries.map(([k, v]) => {
            const val = typeof v === "object" ? JSON.stringify(v) : String(v);
            return `${k}: ${val}`;
          });
          lines.push(`  Details: ${formatted.join(", ")}`);
        }
      }
      assessmentBlocks.push(lines.join("\n"));
    }
  }
  if (assessmentBlocks.length) {
    sections.push(`### Assessment Results\n${assessmentBlocks.join("\n\n")}`);
  }

  // Match history intentionally excluded — previous LLM match scores
  // should not influence future evaluations (circular dependency).

  // Resume text (truncated — useful when intelligence hasn't been extracted yet)
  if (c.resumeText && !intelProfile) {
    const truncated = c.resumeText.length > 4000 ? c.resumeText.slice(0, 4000) + "..." : c.resumeText;
    sections.push(`### Resume\n${truncated}`);
  }

  return sections.join("\n\n");
}

/* -- CRUD instance -------------------------------------------------- */

const candidateCrud = createEntityCrud({
  db,
  table: candidates,
  queryKey: "candidates",
  idField: "id",
  schema: candidateSchema,
  onMutate: () => safeRevalidate("/candidates"),
  getWith: { applications: true },
  scope: (t) => eq(t.status, "active"),
  // Visibility for candidates is driven by org_candidates membership, not by
  // the creator stamp on candidates.organization_id. See
  // docs/vendor-and-attribution-plan.md (Phase 1).
  scopeOverride: (ctx, t) => sql`EXISTS (
    SELECT 1 FROM dilliznt.org_candidates oc
    WHERE oc.candidate_id = ${t.id}
      AND oc.organization_id = ${ctx.organizationId}
  )`,
  searchFields: ["name", "email", "location", "title", "company", "resumeText"],
  searchConfig: { tableName: "candidates" },
  contextWith: {
    intelligence: true,
    applications: {
      with: {
        role: true,
        interviews: { with: { intelligence: true } },
        assessmentAttempts: { with: { intelligence: true, assessment: true } },
      },
    },
  },
  buildContext: buildCandidateContext,
  hooks: {
    afterCreate: async (record) => {
      const ctx = await getActionContext();
      // Vendor-driven candidate creates go through `createVendorCandidate`,
      // which targets a specific hiring org's pool. Skip the default stamp
      // here so we don't accidentally pool the candidate under the vendor org.
      if (ctx.orgType === "vendor") return;
      await db.insert(orgCandidates).values({
        organizationId: ctx.organizationId,
        candidateId: record.id,
        addedById: ctx.user.id,
        addedByName: ctx.user.name,
        addedByOrgId: null,
        source: record.source ?? null,
      }).onConflictDoNothing();
    },
  },
});

export const getCandidates = candidateCrud.list;
export const searchCandidates = candidateCrud.search;
export const searchCandidatesSemantic = candidateCrud.searchSemantic;
export const getCandidateContext = candidateCrud.getEntityContext;

/** Active pipeline counts per candidate with role names (for the list page). */
export async function getCandidateActivePipelines() {
  const ctx = await getActionContext();
  const rows = await db
    .select({
      candidateId: applications.candidateId,
      roleTitle: roles.title,
      count: sql<number>`count(*)::int`,
    })
    .from(applications)
    .innerJoin(roles, eq(applications.roleId, roles.id))
    .where(
      and(
        eq(applications.organizationId, ctx.organizationId),
        sql`${applications.stage} NOT IN ('rejected', 'withdrawn', 'hired')`,
      ),
    )
    .groupBy(applications.candidateId, roles.title);

  const map: Record<string, { count: number; roleName: string | null }> = {};
  for (const row of rows) {
    if (!map[row.candidateId]) {
      map[row.candidateId] = { count: 0, roleName: null };
    }
    map[row.candidateId].count += row.count;
    map[row.candidateId].roleName = row.roleTitle;
  }
  return map;
}
export const getCandidate = candidateCrud.get;

/**
 * Fetch a single candidate with pipeline (applications + role + match)
 * and engagements for the detail page.
 */
export async function getCandidateDetail(id: string) {
  const ctx = await getActionContext();
  const candidate = await candidateCrud.get(id, {
    with: {
      applications: {
        with: {
          role: true,
          match: true,
        },
      },
      matches: {
        with: {
          role: true,
        },
      },
    },
  });
  if (!candidate) return null;

  // Filter applications and matches by current organization
  const filteredApplications = candidate.applications?.filter(
    (app: { organizationId: string }) => app.organizationId === ctx.organizationId
  ) ?? [];
  const filteredMatches = candidate.matches?.filter(
    (match: { organizationId: string }) => match.organizationId === ctx.organizationId
  ) ?? [];

  const filteredCandidate = {
    ...candidate,
    applications: filteredApplications,
    matches: filteredMatches,
  };

  // Engagements are not a formal relation on candidates (they use recipientId),
  // so we query them separately.
  const { engagements } = await import("@/db/schema");
  const { desc } = await import("drizzle-orm");

  const candidateEngagements = await db
    .select({
      id: engagements.id,
      type: engagements.type,
      subject: engagements.subject,
      body: engagements.body,
      channel: engagements.channel,
      status: engagements.status,
      createdByName: engagements.createdByName,
      createdAt: engagements.createdAt,
    })
    .from(engagements)
    .where(and(
      eq(engagements.recipientId, id),
      eq(engagements.organizationId, ctx.organizationId),
    ))
    .orderBy(desc(engagements.createdAt));

  // Intelligence from structured table
  const intelligence = await db.query.candidateIntelligence.findFirst({
    where: eq(candidateIntelligence.candidateId, id),
  });

  // Org-level candidate status
  const orgCandidate = await db.query.orgCandidates.findFirst({
    where: and(
      eq(orgCandidates.candidateId, id),
      eq(orgCandidates.organizationId, ctx.organizationId),
    ),
  });

  return { candidate: filteredCandidate, engagements: candidateEngagements, intelligence: intelligence ?? null, orgStatus: orgCandidate?.status ?? "active" };
}

export const createCandidate = candidateCrud.create;
export const updateCandidate = candidateCrud.update;
export const deleteCandidate = candidateCrud.delete;

/**
 * Vendor-driven candidate add: creates the candidate row (creator stamp =
 * vendor org) and adds it to the **target hiring org's** pool with
 * `addedByOrgId = vendorOrg.id`. Verifies an active partnership before
 * stamping. Unlike the standard `createCandidate`, this skips the default
 * afterCreate hook (see candidateCrud.hooks.afterCreate).
 *
 * (vendor-and-attribution-plan.md Phase 3.)
 */
export async function createVendorCandidate(input: { hiringOrgId: string; data: unknown }) {
  const ctx = await getActionContext();
  if (ctx.orgType !== "vendor") {
    throw new Error("createVendorCandidate is only callable from a vendor org");
  }
  if (!ctx.partneredHiringOrgIds.includes(input.hiringOrgId)) {
    throw new Error("No active partnership with this hiring org");
  }

  const validated = candidateSchema.parse({
    ...(input.data as Record<string, unknown>),
    organizationId: ctx.organizationId,
  });

  const [record] = await db
    .insert(candidates)
    .values({
      ...(validated as any),
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      createdByName: ctx.user.name,
    } as any)
    .returning();

  await db.insert(orgCandidates).values({
    organizationId: input.hiringOrgId,
    candidateId: record.id,
    addedById: ctx.userId,
    addedByName: ctx.user.name,
    addedByOrgId: ctx.organizationId,
    source: "vendor",
  }).onConflictDoNothing();

  return record;
}

export async function setOrgCandidateStatus(
  candidateId: string,
  status: "active" | "talent_pool" | "do_not_hire" | "archived" | "alumni",
) {
  const ctx = await getActionContext();

  const [updated] = await db
    .update(orgCandidates)
    .set({ status })
    .where(and(
      eq(orgCandidates.candidateId, candidateId),
      eq(orgCandidates.organizationId, ctx.organizationId),
    ))
    .returning();

  return updated ?? null;
}
