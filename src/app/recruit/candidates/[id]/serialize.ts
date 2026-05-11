/**
 * Candidate detail serialization — single source of truth for transforming
 * Drizzle relational query results into client-safe props.
 *
 * Types flow from: DB schema ($inferSelect) → serialize → client component.
 * No manual interfaces in the client — import from here.
 */

import type { Candidate, CandidateExperience, CandidateEducation, CandidateProfile } from "@/db/schema/candidates";
import type { Application } from "@/db/schema/applications";
import type { Match } from "@/db/schema/matches";
import type { Role } from "@/db/schema/roles";
import type { CandidateIntelligenceRow } from "@/db/schema/intelligence";

// -- Derived types (what the client receives) ---------------------------

export interface SerializedCandidate {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  location: string | null;
  email: string;
  phone: string | null;
  resumeUrl: string | null;
  talentScore: number | null;
  summary: string | null;
  skills: string[];
  experience: CandidateExperience[];
  education: CandidateEducation[];
  status: string;
  orgStatus: string;
}

export interface SerializedPipeline {
  id: string;
  roleId: string;
  roleName: string;
  roleTeam: string | null;
  stage: string;
  fitScore: number | null;
  daysInStage: number | null;
  createdAt: string;
  /** Short rationale from the match (why this candidate fits this role). */
  signal: string | null;
}

export interface SerializedCandidateMatch {
  id: string;
  roleId: string;
  roleName: string;
  roleTeam: string | null;
  fitScore: number | null;
  recommendation: string | null;
  signal: string | null;
  summary: string | null;
  matchedAt: string;
}

export interface SerializedEngagement {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  channel: string | null;
  createdAt: string;
}

export interface SerializedPillar {
  pillar: string;
  label: string;
  weight: number;
  score: number;
  signals: string[];
}

export interface SerializedAssessment {
  roleFamily: string;
  pillars: SerializedPillar[];
  overall: number;
  rating: string;
  outlook: "positive" | "stable" | "negative";
  confidence: "high" | "medium" | "low";
  gaps: string[];
}

export interface SerializedIntelligence {
  scores?: Record<string, number>;
  signals?: Record<string, string>;
  assessment?: SerializedAssessment | null;
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

export type TimelineEntry =
  | { kind: "engagement"; id: string; type: string; channel: string | null; subject: string | null; body: string | null; status: string; createdByName: string | null; createdAt: string }
  | { kind: "triage"; id: string; type: string; urgency: string; title: string; subtitle: string | null; action: string | null; status: string; createdAt: string }
  | { kind: "note"; id: string; body: string; createdByName: string | null; createdAt: string };

export interface CandidateDetailProps {
  candidate: SerializedCandidate;
  pipelines: SerializedPipeline[];
  matches: SerializedCandidateMatch[];
  timeline: TimelineEntry[];
  intelligence: SerializedIntelligence | null;
}

// -- Helpers -------------------------------------------------------------

const PILLAR_LABELS: Record<string, string> = {
  coreCompetency: "Core Competency",
  appliedProof: "Applied Proof",
  problemSolving: "Problem Solving",
  operationalMaturity: "Operational Maturity",
  collaborationLeadership: "Collaboration & Leadership",
  trajectory: "Trajectory",
  missionResonance: "Mission Resonance",
};

function serializeDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return d instanceof Date ? d.toISOString() : String(d);
}

function serializeAssessment(intel: CandidateIntelligenceRow | null): SerializedAssessment | null {
  if (!intel?.talentAssessment) return null;
  const d = intel.talentAssessment as unknown as Record<string, unknown>;
  if (!d.pillars || !Array.isArray(d.pillars)) return null;

  return {
    roleFamily: (d.roleFamily as string) ?? "unknown",
    pillars: (d.pillars as any[]).map((p) => ({
      pillar: p.pillar,
      label: PILLAR_LABELS[p.pillar] ?? p.pillar,
      weight: p.weight,
      score: p.score,
      signals: Array.isArray(p.signals) ? p.signals : [],
    })),
    overall: (d.overall as number) ?? 0,
    rating: (d.rating as string) ?? "",
    outlook: (d.outlook as "positive" | "stable" | "negative") ?? "stable",
    confidence: (d.confidence as "high" | "medium" | "low") ?? "low",
    gaps: Array.isArray(d.gaps) ? d.gaps : [],
  };
}

// -- Main serializer -----------------------------------------------------

type CandidateWithRelations = Candidate & {
  applications: (Application & { role: Role; match: Match | null })[];
  matches: (Match & { role: Role })[];
};

import type { TriageItem } from "@/db/schema/triage-items";

interface CandidateDetailRaw {
  candidate: CandidateWithRelations;
  engagements: { id: string; type: string; subject: string | null; body: string | null; channel: string | null; status: string; createdByName: string | null; createdAt: Date | null }[];
  intelligence: CandidateIntelligenceRow | null;
  activityLog: TriageItem[];
  notes: { id: string; body: string; createdByName: string | null; createdAt: Date | null }[];
  orgStatus?: string;
}

export function serializeCandidateDetail(raw: CandidateDetailRaw): CandidateDetailProps {
  const { candidate, engagements, intelligence, activityLog: rawActivityLog, notes, orgStatus } = raw;
  const profile = candidate.profile as CandidateProfile | null;

  const serializedCandidate: SerializedCandidate = {
    id: candidate.id,
    name: candidate.name,
    title: candidate.title,
    company: candidate.company,
    location: candidate.location,
    email: candidate.email,
    phone: candidate.phone,
    resumeUrl: candidate.resumeUrl,
    talentScore: candidate.talentScore,
    summary: profile?.summary || null,
    skills: (candidate.skills as string[]) || [],
    experience: ((candidate.experience as CandidateExperience[]) || []).map((e) => ({
      title: e.title || "",
      company: e.company || "",
      startDate: e.startDate || undefined,
      endDate: e.endDate || undefined,
      description: e.description || undefined,
    })),
    education: ((candidate.education as CandidateEducation[]) || []).map((e) => ({
      institution: e.institution || "",
      degree: e.degree || "",
      field: e.field || undefined,
      year: e.year || undefined,
    })),
    status: candidate.status,
    orgStatus: orgStatus ?? "active",
  };

  const pipelines: SerializedPipeline[] = candidate.applications.map((app) => ({
    id: app.id,
    roleId: app.roleId,
    roleName: app.role.title,
    roleTeam: app.role.team,
    stage: app.stage,
    fitScore: app.match?.fitScore ?? null,
    daysInStage: app.daysInStage,
    createdAt: serializeDate(app.createdAt),
    signal: app.match?.signal ?? null,
  }));

  const serializedEngagements: SerializedEngagement[] = engagements.map((e) => ({
    id: e.id,
    type: e.type,
    subject: e.subject,
    body: e.body,
    channel: e.channel,
    createdAt: serializeDate(e.createdAt),
  }));

  // Serialize matches (active, not already in pipeline)
  const pipelineRoleIds = new Set(candidate.applications.map((a) => a.roleId));
  const serializedMatches: SerializedCandidateMatch[] = (candidate.matches ?? [])
    .filter((m) => m.status === "active" && !pipelineRoleIds.has(m.roleId) && (m.fitScore ?? 0) >= 10)
    .sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0))
    .map((m) => ({
      id: m.id,
      roleId: m.roleId,
      roleName: m.role.title,
      roleTeam: m.role.team,
      fitScore: m.fitScore,
      recommendation: m.recommendation,
      signal: m.signal,
      summary: m.summary,
      matchedAt: serializeDate(m.lastEvaluatedAt),
    }));

  // Build intelligence from structured candidate_intelligence table
  const assessment = serializeAssessment(intelligence);

  // Build unified timeline from all three sources
  const timeline: TimelineEntry[] = [
    ...engagements.map((e): TimelineEntry => ({
      kind: "engagement",
      id: e.id,
      type: e.type,
      channel: e.channel,
      subject: e.subject,
      body: e.body,
      status: e.status,
      createdByName: e.createdByName,
      createdAt: serializeDate(e.createdAt),
    })),
    ...rawActivityLog.map((t): TimelineEntry => ({
      kind: "triage",
      id: t.id,
      type: t.type,
      urgency: t.urgency,
      title: t.title,
      subtitle: t.subtitle ?? null,
      action: t.action ?? null,
      status: t.status,
      createdAt: serializeDate(t.createdAt),
    })),
    ...notes.map((n): TimelineEntry => ({
      kind: "note",
      id: n.id,
      body: n.body,
      createdByName: n.createdByName,
      createdAt: serializeDate(n.createdAt),
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    candidate: serializedCandidate,
    pipelines,
    matches: serializedMatches,
    timeline,
    intelligence: assessment ? { assessment } : null,
  };
}
