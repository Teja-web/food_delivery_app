/**
 * Today/dashboard serialization — single source of truth for transforming
 * action results into client-safe props.
 *
 * Types flow from: DB schema ($inferSelect) → serialize → client component.
 * No manual interfaces in the client — import from here.
 */

import type { Role } from "@/db/schema/roles";
import type { TriageItem } from "@/db/schema/triage-items";
import type { Interview, InterviewPanelist } from "@/db/schema/interviews";

// -- Shared helpers ---------------------------------------------------

function serializeDate(d: Date | string | null): string {
  if (!d) return "";
  return d instanceof Date ? d.toISOString() : String(d);
}

// -- Pipeline map -----------------------------------------------------

export type PipelineCounts = { sourced: number; interview: number; offer: number };

export function buildPipelineMap(
  rows: { roleId: string; stage: string; count: number }[],
): Record<string, PipelineCounts> {
  const map: Record<string, PipelineCounts> = {};
  for (const row of rows) {
    if (!map[row.roleId]) {
      map[row.roleId] = { sourced: 0, interview: 0, offer: 0 };
    }
    const stage = row.stage as keyof PipelineCounts;
    if (stage in map[row.roleId]) {
      map[row.roleId][stage] = row.count;
    }
  }
  return map;
}

// -- Serialized types (what the client receives) ---------------------

export interface SerializedDashboardRole {
  id: string;
  title: string;
  team: string | null;
  location: string | null;
  status: string;
  createdAt: string;
  pipeline: PipelineCounts;
}

export interface SerializedTriageItem {
  id: string;
  type: string;
  urgency: string;
  title: string;
  subtitle: string | null;
  roleId: string | null;
  candidateId: string | null;
  interviewId: string | null;
  applicationId: string | null;
  action: string | null;
  actionParams: Record<string, unknown> | null;
  status: string;
  createdAt: string;
}

export interface SerializedInterview {
  id: string;
  candidateId: string | null;
  roleId: string | null;
  panelistNames: string[];
  interviewType: string | null;
  scheduledAt: string | null;
  durationMins: number | null;
  evidenceTarget: string | null;
  status: string;
  candidateName: string | null;
  roleName: string | null;
}

export interface MyActivity {
  candidatesScreened: number;
  interviewsScheduled: number;
  applicationsAdvanced: number;
  offersMade: number;
}

export interface TodayClientProps {
  roles: SerializedDashboardRole[];
  triageItems: SerializedTriageItem[];
  interviews: SerializedInterview[];
  briefing: string | null;
  myActivity: MyActivity;
}

// -- Serializers -----------------------------------------------------

export function serializeRole(
  r: Role,
  pipeline: PipelineCounts,
): SerializedDashboardRole {
  return {
    id: r.id,
    title: r.title,
    team: r.team,
    location: r.location,
    status: r.status,
    createdAt: serializeDate(r.createdAt),
    pipeline,
  };
}

export function serializeTriageItem(t: TriageItem): SerializedTriageItem {
  return {
    id: t.id,
    type: t.type,
    urgency: t.urgency,
    title: t.title,
    subtitle: t.subtitle,
    roleId: t.roleId,
    candidateId: t.candidateId,
    interviewId: t.interviewId,
    applicationId: t.applicationId,
    action: t.action,
    actionParams: t.actionParams,
    status: t.status,
    createdAt: serializeDate(t.createdAt),
  };
}

type PanelistWithUser = InterviewPanelist & { user?: { name: string } | null };

export function serializeInterview(
  iv: Interview & { application?: { candidate?: { name: string } | null; role?: { title: string } | null } | null; panelists?: PanelistWithUser[] },
): SerializedInterview {
  return {
    id: iv.id,
    candidateId: iv.candidateId,
    roleId: iv.roleId,
    panelistNames: (iv.panelists ?? []).map((p) => p.user?.name ?? "Unknown").filter(Boolean),
    interviewType: iv.interviewType,
    scheduledAt: serializeDate(iv.scheduledAt),
    durationMins: iv.durationMins,
    evidenceTarget: iv.evidenceTarget,
    status: iv.status,
    candidateName: iv.application?.candidate?.name ?? null,
    roleName: iv.application?.role?.title ?? null,
  };
}
