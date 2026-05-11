/**
 * Role detail serialization — single source of truth for transforming
 * Drizzle relational query results into client-safe props.
 *
 * Types flow from: DB schema ($inferSelect) → serialize → client component.
 * No manual interfaces in the client — import from here.
 */

import type { Role, RoleCriteriaConfig } from "@/db/schema/roles";
import type { Application } from "@/db/schema/applications";
import type { Match, CriterionAlignment } from "@/db/schema/matches";
import type { Candidate } from "@/db/schema/candidates";
import type { Interview } from "@/db/schema/interviews";
import type { Scorecard, ScorecardRatingEntry, InterviewStage } from "@/db/schema/interviews";
import type { TriageItem } from "@/db/schema/triage-items";

// -- Derived types (what the client receives) ---------------------------

type CriterionWeight = "critical" | "important" | "nice_to_have";
type CriterionRating = "strong" | "partial" | "gap";

export type EvidenceSource = "resume" | "interview" | "assessment" | "talent_score";

export interface SerializedAlignment {
  criterion: string;
  rating: CriterionRating;
  weight: CriterionWeight | null;
  sources?: EvidenceSource[];
  evidence?: string;
}

/** How much of the score is backed by observed (interview/assessment) evidence */
export interface EvidenceBasis {
  /** Criteria with interview or assessment evidence */
  observed: number;
  /** Criteria with only resume/talent_score evidence */
  paperOnly: number;
  /** Total criteria evaluated */
  total: number;
  /** "paper" | "partial" | "validated" */
  confidence: "paper" | "partial" | "validated";
}

export interface SerializedInterviewProgress {
  stageId: string;
  stageName: string;
  order: number;
  status: "completed" | "proposed" | "pending";
  scheduledAt: string | null;
  verdict: string | null;
  interviewId: string | null;
}

export interface SerializedApplication {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateTitle: string | null;
  candidateCompany: string | null;
  stage: string;
  fitScore: number | null;
  recommendation: string | null;
  alignment: SerializedAlignment[];
  signal: string | null;
  gaps: string[];
  summary: string | null;
  evidenceBasis: EvidenceBasis;
  daysInStage: number | null;
  source: string | null;
  createdAt: string;
  interviewProgress: SerializedInterviewProgress[];
  currentInterviewId: string | null;
  currentStageId: string | null;
  /** Offer ID if application is in offer stage (for direct navigation) */
  offerId: string | null;
  /** Latest application-scoped note preview (entityType="application"), for the row */
  lastNotePreview?: string;
  lastNoteAuthor?: string;
  lastNoteAt?: string;
}

export interface SerializedRecommended {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateTitle: string | null;
  candidateCompany: string | null;
  candidateSource: string | null;
  fitScore: number | null;
  recommendation: string | null;
  alignment: SerializedAlignment[];
  signal: string | null;
  gaps: string[];
  summary: string | null;
  evidenceBasis: EvidenceBasis;
  matchedAt: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  count: number;
  type: "system" | "interview";
}

export interface SerializedRole {
  id: string;
  title: string;
  team: string | null;
  hiringManagerName: string | null;
  recruiterName: string | null;
  location: string | null;
  health: string | null;
  status: string;
  headcount: number | null;
  compensation: { min: number; max: number; currency?: string; equity?: string; bonus?: string } | null;
  keywords: string[];
  department: string | null;
  description: string | null;
  createdAt: string;
  pipeline: PipelineStage[];
}

export interface SerializedScorecardRating {
  competency: string;
  rating: number;
  evidence: string;
}

export interface SerializedScorecard {
  id: string;
  reviewerName: string | null;
  overallRating: number | null;
  verdict: string | null;
  notes: string | null;
  ratings: SerializedScorecardRating[];
  createdAt: string;
}

export interface SerializedInterview {
  id: string;
  candidateName: string | null;
  candidateTitle: string | null;
  panelistNames: string[];
  interviewType: string | null;
  stageName: string | null;
  scheduledAt: string | null;
  durationMins: number | null;
  location: string | null;
  meetingLink: string | null;
  evidenceTarget: string | null;
  status: string;
  scorecards: SerializedScorecard[];
}

export interface PanelHealth {
  evidenceCoverage: string;
  scorerDrift: string;
  decisionReadiness: string;
  warning: string | null;
}

export interface SerializedTriageItem {
  id: string;
  type: string;
  urgency: string;
  title: string;
  subtitle: string | null;
  action: string | null;
  createdAt: string;
}

export interface SerializedActivityEntry {
  id: string;
  type: string;
  urgency: string;
  title: string;
  subtitle: string | null;
  action: string | null;
  status: string;
  createdAt: string;
}

export interface RoleDetailProps {
  role: SerializedRole;
  applications: SerializedApplication[];
  applicationsTotal: number;
  interviews: SerializedInterview[];
  recommended: SerializedRecommended[];
  recommendedTotal: number;
  panelHealth: PanelHealth | null;
  triageItems: SerializedTriageItem[];
  activityLog: SerializedActivityEntry[];
  /** Counts for Pipeline smart filter chips (stale, decision-ready). */
  pipelineSmartCounts?: { stale: number; decisionReady: number };
  /** Counts for Recommended smart filter chips (newThisWeek). */
  recommendedSmartCounts?: { newThisWeek: number };
}

// -- Helpers -------------------------------------------------------------

function scoreToRating(score: number): CriterionRating {
  if (score >= 75) return "strong";
  if (score >= 50) return "partial";
  return "gap";
}

function serializeDate(d: Date | string | null): string {
  if (!d) return "";
  return d instanceof Date ? d.toISOString() : String(d);
}

function buildWeightMap(config: RoleCriteriaConfig | null | undefined): Record<string, CriterionWeight> {
  const map: Record<string, CriterionWeight> = {};
  if (config?.criteria) {
    for (const c of config.criteria) {
      map[c.name] = c.weight;
    }
  }
  return map;
}

function serializeAlignment(
  raw: CriterionAlignment[] | null | undefined,
  weightMap: Record<string, CriterionWeight>,
): SerializedAlignment[] {
  return (raw ?? []).map((a) => ({
    criterion: a.criterion,
    rating: scoreToRating(a.score),
    weight: weightMap[a.criterion] ?? null,
    evidence: a.evidence,
    sources: a.sources,
  }));
}

const OBSERVED_SOURCES: EvidenceSource[] = ["interview", "assessment"];

function computeEvidenceBasis(alignment: SerializedAlignment[]): EvidenceBasis {
  const total = alignment.length;
  if (total === 0) return { observed: 0, paperOnly: 0, total: 0, confidence: "paper" };

  let observed = 0;
  for (const a of alignment) {
    if (a.sources?.some((s) => OBSERVED_SOURCES.includes(s))) {
      observed++;
    }
  }
  const paperOnly = total - observed;
  const ratio = observed / total;
  const confidence = ratio >= 0.6 ? "validated" : ratio > 0 ? "partial" : "paper";
  return { observed, paperOnly, total, confidence };
}

// -- Main serializer -----------------------------------------------------

type InterviewWithScorecards = Interview & { scorecards?: Scorecard[] };

type ApplicationWithRelations = Application & { candidate: Candidate; match: Match | null; interviews: InterviewWithScorecards[]; offers?: { id: string }[] };

type RoleWithRelations = Role & {
  applications: ApplicationWithRelations[];
  matches: (Match & { candidate: Candidate })[];
  interviewStages?: InterviewStage[];
};

type MatchWithCandidate = Match & { candidate: Candidate };

/**
 * Latest note per application, keyed by application id.
 * Pre-fetched (e.g. via fetchLatestNotePerEntity) and threaded in so that
 * serializeApplicationsPage stays sync.
 */
export type ApplicationNotesMap = Map<
  string,
  { body: string; createdAt: Date; createdByName: string | null }
>;

/**
 * Serialize a page of applications independently (for client-side pagination).
 * Needs the role's criteriaConfig and interviewStages for weight map and progress.
 *
 * Optionally accepts a notes map; when provided, lastNotePreview / lastNoteAt /
 * lastNoteAuthor are populated for the row's note snippet.
 */
export function serializeApplicationsPage(
  apps: ApplicationWithRelations[],
  criteriaConfig: RoleCriteriaConfig | null | undefined,
  roleStages: InterviewStage[],
  notesMap?: ApplicationNotesMap,
): SerializedApplication[] {
  const weightMap = buildWeightMap(criteriaConfig);
  const sortedStages = [...roleStages].sort((a, b) => a.order - b.order);
  const PREVIEW_MAX = 80;

  return apps.map((app) => {
    const appInterviews = app.interviews ?? [];
    const interviewProgress: SerializedInterviewProgress[] = sortedStages.map((stage) => {
      const iv = appInterviews.find((i) => i.stageId === stage.id);
      const hasScorecard = iv && (iv.scorecards ?? []).length > 0;
      const verdict = hasScorecard ? (iv.scorecards![0].verdict ?? null) : null;
      return {
        stageId: stage.id,
        stageName: stage.name,
        order: stage.order,
        status: hasScorecard ? "completed" : iv ? "proposed" : "pending",
        scheduledAt: iv ? serializeDate(iv.scheduledAt) : null,
        verdict,
        interviewId: iv?.id ?? null,
      };
    });

    const currentProgress = interviewProgress.find((p) => p.status !== "completed");
    const alignment = serializeAlignment(app.match?.alignment, weightMap);

    const note = notesMap?.get(app.id);
    const lastNotePreview = note
      ? note.body.length > PREVIEW_MAX
        ? note.body.slice(0, PREVIEW_MAX).trimEnd() + "…"
        : note.body
      : undefined;

    return {
      id: app.id,
      candidateId: app.candidateId,
      candidateName: app.candidate.name,
      candidateTitle: app.candidate.title,
      candidateCompany: app.candidate.company,
      stage: app.stage,
      fitScore: app.match?.fitScore ?? null,
      recommendation: app.match?.recommendation ?? null,
      alignment,
      signal: app.match?.signal ?? null,
      gaps: app.match?.gaps ?? [],
      summary: app.match?.summary ?? null,
      evidenceBasis: computeEvidenceBasis(alignment),
      daysInStage: app.daysInStage,
      source: app.source,
      createdAt: serializeDate(app.createdAt),
      interviewProgress,
      currentInterviewId: currentProgress?.interviewId ?? null,
      currentStageId: currentProgress?.stageId ?? null,
      offerId: app.offers?.[0]?.id ?? null,
      lastNotePreview,
      lastNoteAuthor: note?.createdByName ?? undefined,
      lastNoteAt: note ? serializeDate(note.createdAt) : undefined,
    };
  });
}

/**
 * Serialize a page of recommendations independently (for client-side pagination).
 */
export function serializeRecommendationsPage(
  recs: MatchWithCandidate[],
  criteriaConfig: RoleCriteriaConfig | null | undefined,
): SerializedRecommended[] {
  const weightMap = buildWeightMap(criteriaConfig);

  return recs.map((m) => {
    const alignment = serializeAlignment(m.alignment, weightMap);
    return {
      id: m.id,
      candidateId: m.candidateId,
      candidateName: m.candidate.name,
      candidateTitle: m.candidate.title,
      candidateCompany: m.candidate.company,
      candidateSource: m.candidate.source,
      fitScore: m.fitScore,
      recommendation: m.recommendation,
      alignment,
      signal: m.signal,
      gaps: m.gaps ?? [],
      summary: m.summary,
      evidenceBasis: computeEvidenceBasis(alignment),
      matchedAt: serializeDate(m.lastEvaluatedAt),
    };
  });
}

/**
 * Main role detail serializer.
 * Applications and recommendations are now passed separately (paginated).
 *
 * `appNotesMap` is optional — when provided, application rows get
 * lastNotePreview / lastNoteAuthor / lastNoteAt populated. The page-level
 * caller fetches this via fetchLatestNotePerEntity("application", ids).
 */
export function serializeRoleDetail(
  role: RoleWithRelations,
  appPage: { items: ApplicationWithRelations[]; total: number },
  recPage: { items: MatchWithCandidate[]; total: number },
  rawTriageItems: TriageItem[] = [],
  allTriageItems: TriageItem[] = [],
  appNotesMap?: ApplicationNotesMap,
  pipelineSmartCounts?: { stale: number; decisionReady: number },
  recommendedSmartCounts?: { newThisWeek: number },
): RoleDetailProps {
  const weightMap = buildWeightMap(role.criteriaConfig as RoleCriteriaConfig | null);

  // Build dynamic pipeline stages (uses ALL applications from role for counts)
  const roleStages = (role.interviewStages ?? []).sort((a, b) => a.order - b.order);
  const stageCountMap: Record<string, number> = { sourced: 0, offer: 0 };
  const interviewStageCountMap: Record<string, number> = {};
  for (const s of roleStages) {
    interviewStageCountMap[s.id] = 0;
  }

  for (const app of role.applications) {
    if (app.stage === "interview" && roleStages.length > 0) {
      const latestInterview = (app.interviews ?? [])
        .filter((iv) => iv.stageId)
        .sort((a, b) => (b.scheduledAt?.getTime() ?? 0) - (a.scheduledAt?.getTime() ?? 0))[0];
      const stageId = latestInterview?.stageId;
      if (stageId && stageId in interviewStageCountMap) {
        interviewStageCountMap[stageId]++;
      } else {
        const firstStage = roleStages[0];
        if (firstStage) interviewStageCountMap[firstStage.id]++;
      }
    } else if (app.stage in stageCountMap) {
      stageCountMap[app.stage]++;
    }
  }

  const pipeline: PipelineStage[] = [
    { id: "sourced", name: "Sourced", count: stageCountMap.sourced, type: "system" },
    ...roleStages.map((s) => ({
      id: s.id,
      name: s.name,
      count: interviewStageCountMap[s.id] ?? 0,
      type: "interview" as const,
    })),
    { id: "offer", name: "Offer", count: stageCountMap.offer, type: "system" },
  ];

  if (roleStages.length === 0) {
    const interviewCount = role.applications.filter((a) => a.stage === "interview").length;
    pipeline.splice(1, 0, { id: "interview", name: "Interview", count: interviewCount, type: "system" });
  }

  // Serialize the paginated application page
  const applications = serializeApplicationsPage(
    appPage.items,
    role.criteriaConfig as RoleCriteriaConfig | null,
    roleStages,
    appNotesMap,
  );

  // Serialize the paginated recommendations page
  const recommended = serializeRecommendationsPage(
    recPage.items,
    role.criteriaConfig as RoleCriteriaConfig | null,
  );

  // Serialize interviews (collected from all applications — needed for panel health)
  const candidateMap = new Map(role.applications.map((a) => [a.candidateId, a.candidate]));
  const stageNameMap = new Map(roleStages.map((s) => [s.id, s.name]));
  const interviews: SerializedInterview[] = role.applications
    .flatMap((app) => (app.interviews ?? []).map((iv) => ({
      id: iv.id,
      candidateName: candidateMap.get(iv.candidateId ?? "")?.name ?? null,
      candidateTitle: candidateMap.get(iv.candidateId ?? "")?.title ?? null,
      panelistNames: ((iv as any).panelists ?? []).map((p: any) => p.user?.name ?? "Unknown").filter(Boolean),
      interviewType: iv.interviewType,
      stageName: iv.stageId ? stageNameMap.get(iv.stageId) ?? null : null,
      scheduledAt: serializeDate(iv.scheduledAt),
      durationMins: iv.durationMins,
      location: iv.location,
      meetingLink: iv.meetingLink,
      evidenceTarget: iv.evidenceTarget,
      status: iv.status,
      scorecards: (iv.scorecards ?? []).map((sc) => ({
        id: sc.id,
        reviewerName: sc.reviewerName,
        overallRating: sc.overallRating,
        verdict: sc.verdict,
        notes: sc.notes,
        ratings: (sc.ratings as ScorecardRatingEntry[] ?? []).map((r) => ({
          competency: r.competency,
          rating: r.rating,
          evidence: r.evidence,
        })),
        createdAt: serializeDate(sc.createdAt),
      })),
    })))
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

  // Compute panel health from scorecards
  const allScorecards = interviews.flatMap((iv) => iv.scorecards);
  let panelHealth: PanelHealth | null = null;

  if (allScorecards.length > 0) {
    const criteriaConfig = role.criteriaConfig as RoleCriteriaConfig | null;
    const totalCriteria = criteriaConfig?.criteria?.length ?? 0;
    const coveredCriteria = new Set<string>();
    for (const sc of allScorecards) {
      for (const r of sc.ratings) {
        coveredCriteria.add(r.competency);
      }
    }
    const evidenceCoverage = totalCriteria > 0
      ? `${coveredCriteria.size} / ${totalCriteria} competencies covered across slate`
      : `${coveredCriteria.size} competencies evaluated`;

    const reviewerAverages: Record<string, number[]> = {};
    for (const sc of allScorecards) {
      const name = sc.reviewerName ?? "Unknown";
      if (sc.overallRating != null) {
        if (!reviewerAverages[name]) reviewerAverages[name] = [];
        reviewerAverages[name].push(sc.overallRating);
      }
    }
    const allRatings = Object.values(reviewerAverages).flat();
    const overallMedian = allRatings.length > 0
      ? allRatings.sort((a, b) => a - b)[Math.floor(allRatings.length / 2)]
      : 0;
    let scorerDrift = "Within normal range";
    let warning: string | null = null;
    for (const [name, ratings] of Object.entries(reviewerAverages)) {
      const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
      const drift = Math.abs(avg - overallMedian);
      if (drift > 1 && overallMedian > 0) {
        const pct = Math.round((drift / overallMedian) * 100);
        const direction = avg > overallMedian ? "above" : "below";
        scorerDrift = `${name} scoring +${pct}% ${direction} team median`;
        warning = `${name} may be ${avg > overallMedian ? "over" : "under"}-indexing — consider an additional structured review`;
      }
    }

    // Decision readiness (use full application list from role for accurate counts)
    const offerReady = role.applications.filter((a) => a.stage === "offer").length;
    const interviewStage = role.applications.filter((a) => a.stage === "interview").length;
    const decisionReadiness = offerReady > 0
      ? `${offerReady} candidate${offerReady > 1 ? "s" : ""} ready for offer, ${interviewStage} in final stages`
      : interviewStage > 0
        ? `No candidates ready for offer — ${interviewStage} still in interviews`
        : "No candidates in advanced stages yet";

    panelHealth = { evidenceCoverage, scorerDrift, decisionReadiness, warning };
  }

  return {
    role: {
      id: role.id,
      title: role.title,
      team: role.team,
      hiringManagerName: (role as any).hiringManager?.name ?? null,
      recruiterName: (role as any).recruiter?.name ?? null,
      location: role.location,
      health: role.health,
      status: role.status,
      headcount: role.headcount,
      compensation: role.compensation as SerializedRole["compensation"],
      keywords: ((role.criteriaConfig as RoleCriteriaConfig | null)?.keywords ?? [])
        .filter((k) => k.importance === "critical" || k.importance === "important")
        .slice(0, 4)
        .map((k) => k.term),
      department: role.department ?? null,
      description: role.description ?? null,
      createdAt: serializeDate(role.createdAt),
      pipeline,
    },
    applications,
    applicationsTotal: appPage.total,
    interviews,
    recommended,
    recommendedTotal: recPage.total,
    panelHealth,
    triageItems: rawTriageItems.map((t) => ({
      id: t.id,
      type: t.type,
      urgency: t.urgency,
      title: t.title,
      subtitle: t.subtitle,
      action: t.action,
      createdAt: serializeDate(t.createdAt),
    })),
    activityLog: allTriageItems.map((t) => ({
      id: t.id,
      type: t.type,
      urgency: t.urgency,
      title: t.title,
      subtitle: t.subtitle ?? null,
      action: t.action ?? null,
      status: t.status,
      createdAt: serializeDate(t.createdAt),
    })),
    pipelineSmartCounts,
    recommendedSmartCounts,
  };
}

