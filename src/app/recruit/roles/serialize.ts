/**
 * Roles list serialization — single source of truth for transforming
 * Drizzle query results into client-safe props for the roles list page.
 *
 * Types flow from: DB schema ($inferSelect) → serialize → client component.
 * No manual interfaces in the client — import from here.
 */

import type { Role, RoleCompensation } from "@/db/schema/roles";

// -- Derived types for the list page --------------------------------------

export type AttentionReason = "decide" | "stalled" | "due_soon" | "no_candidates";

export interface SerializedListRole {
  id: string;
  title: string;
  team: Role["team"];
  department: Role["department"];
  hiringManagerName: string | null;
  recruiterName: string | null;
  location: Role["location"];
  health: Role["health"];
  status: string;
  headcount: Role["headcount"];
  compensation: RoleCompensation | null;
  employmentType: Role["employmentType"];
  createdAt: string;
  closedDate: string | null;
  targetHireDate: string | null;
  outcome: Role["outcome"];
  fulfilment: { title: string; action: string | null; urgency: string } | null;
  /** Active candidates bucketed for the mini funnel sparkline. */
  stageCounts: { sourced: number; interview: number; offer: number };
  totalActive: number;
  attentionReasons: AttentionReason[];
  /** Higher = more urgent. Used as default sort key. */
  urgencyScore: number;
  /** Most recent updatedAt across role + applications. */
  lastActivityAt: string;
}

export interface RolesListClientProps {
  roles: SerializedListRole[];
  openTotal: number;
}

// -- Input type (role with joined user relations + applications) ----------

type RoleApplication = {
  stage: string;
  updatedAt: Date | string | null;
};

type RoleWithUsers = Role & {
  hiringManager?: { name: string } | null;
  recruiter?: { name: string } | null;
  applications?: RoleApplication[] | null;
};

// -- Helpers --------------------------------------------------------------

function serializeDate(d: Date | string | null): string {
  if (!d) return "";
  return d instanceof Date ? d.toISOString() : String(d);
}

function toMs(d: Date | string | null | undefined): number {
  if (!d) return 0;
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

const ACTIVE_STAGES = new Set(["sourced", "interview", "offer"]);

// -- Serializer -----------------------------------------------------------

export function serializeListRole(
  role: RoleWithUsers,
  fulfilment: { title: string; action: string | null; urgency: string } | null = null,
): SerializedListRole {
  const apps = role.applications ?? [];
  const stageCounts = { sourced: 0, interview: 0, offer: 0 };
  let lastAppUpdate = 0;
  for (const app of apps) {
    if (app.stage in stageCounts) stageCounts[app.stage as keyof typeof stageCounts]++;
    const ms = toMs(app.updatedAt);
    if (ms > lastAppUpdate) lastAppUpdate = ms;
  }
  const totalActive = apps.filter((a) => ACTIVE_STAGES.has(a.stage)).length;

  const lastActivityMs = Math.max(toMs(role.updatedAt), lastAppUpdate);
  const lastActivityAt = lastActivityMs > 0 ? new Date(lastActivityMs).toISOString() : serializeDate(role.createdAt);

  // Attention reasons — cheap signals only.
  const reasons: AttentionReason[] = [];
  const now = Date.now();
  const dayMs = 1000 * 60 * 60 * 24;
  const daysOpen = Math.max(0, Math.floor((now - toMs(role.createdAt)) / dayMs));

  if (stageCounts.offer > 0) reasons.push("decide");
  if (fulfilment && (fulfilment.urgency === "high" || fulfilment.urgency === "critical")) reasons.push("stalled");

  let daysToTarget: number | null = null;
  if (role.targetHireDate) {
    daysToTarget = Math.ceil((toMs(role.targetHireDate) - now) / dayMs);
    if (daysToTarget <= 14) reasons.push("due_soon");
  }
  if (totalActive === 0 && daysOpen >= 3) reasons.push("no_candidates");

  // Urgency score — drives default sort.
  let urgencyScore = 0;
  if (fulfilment?.urgency === "critical") urgencyScore += 200;
  else if (fulfilment?.urgency === "high") urgencyScore += 100;
  else if (fulfilment?.urgency === "medium") urgencyScore += 40;
  if (reasons.includes("decide")) urgencyScore += 80;
  if (daysToTarget !== null) {
    if (daysToTarget < 0) urgencyScore += 200 + Math.min(180, Math.abs(daysToTarget) * 8);
    else if (daysToTarget <= 14) urgencyScore += 80 - daysToTarget * 4;
  }
  if (reasons.includes("no_candidates")) urgencyScore += 40 + Math.min(60, daysOpen);

  return {
    id: role.id,
    title: role.title,
    team: role.team,
    department: role.department,
    hiringManagerName: role.hiringManager?.name ?? null,
    recruiterName: role.recruiter?.name ?? null,
    location: role.location,
    health: role.health,
    status: role.status,
    headcount: role.headcount,
    compensation: role.compensation as RoleCompensation | null,
    employmentType: role.employmentType,
    createdAt: serializeDate(role.createdAt),
    closedDate: role.closedDate ? serializeDate(role.closedDate) : null,
    targetHireDate: role.targetHireDate ? serializeDate(role.targetHireDate) : null,
    outcome: role.outcome,
    fulfilment,
    stageCounts,
    totalActive,
    attentionReasons: reasons,
    urgencyScore,
    lastActivityAt,
  };
}
