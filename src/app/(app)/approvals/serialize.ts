import type { Approval, ApprovalEntityType, ApprovalStatus } from "@/db/schema/approval";

import type { AutonomyLevel } from "@/components/trust/AutonomyPill";

export interface ApprovalRowClient {
  id: string;
  entityType: ApprovalEntityType;
  entityId: string;
  status: ApprovalStatus;
  title: string;
  projectKey: string | null;
  phase: string | null;
  requestedByName: string;
  /** True when requested by a bot/skill — drives the autonomy badge styling. */
  isBotRequester: boolean;
  /** Skill slug parsed from `requestedByName` for bot rows, e.g. "frontend-test-author". */
  skillSlug: string | null;
  /** Actual autonomy level for the originating skill, or null when we can't resolve it. */
  skillLevel: AutonomyLevel | null;
  requesterNote: string | null;
  ageLabel: string;
  ageDays: number;
  isStale: boolean;
  autoEligible: boolean;
  /** Why this approval is auto-eligible (or "" if not eligible). */
  autoReason: string;
}

export interface InboxTabsClient {
  mine: number;
  team: number;
  all: number;
}

export interface ApprovalsInboxClient {
  tabs: InboxTabsClient;
  approvals: ApprovalRowClient[];
  /** Current user id — for "Mine" filtering on the client */
  currentUserId: string;
}

function formatAge(date: Date): { label: string; days: number } {
  const ms = Date.now() - date.getTime();
  const minutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return { label: `${days}d`, days };
  if (hours >= 1) return { label: `${hours}h`, days: 0 };
  if (minutes >= 1) return { label: `${minutes}m`, days: 0 };
  return { label: "just now", days: 0 };
}

/**
 * v1 title resolver. The approval row carries `entityType` + `entityId` but
 * not a title — the title lives in the target entity (plan/work_item/etc.).
 * For v1 we synthesize a label from entityType + a short id. Replace once
 * approvals carry a denormalized title or once we batch-join.
 */
function resolveTitle(a: Approval): string {
  if (a.requesterNote && a.requesterNote.length <= 80) return a.requesterNote;
  const shortId = a.entityId.slice(0, 8);
  switch (a.entityType) {
    case "plan":
      return `plan · ${shortId}`;
    case "phase_gate":
      return `phase gate · ${a.phase ?? shortId}`;
    case "release":
      return `release · ${shortId}`;
    case "work_item":
      return `work item · ${shortId}`;
    default:
      return `${a.entityType} · ${shortId}`;
  }
}

const BOT_NAMES = new Set(["bot", "system", "skill", "agent"]);

/**
 * Bot-requested approvals are seeded with names like `"frontend-test-author (bot)"`
 * or `"doc-updater (bot)"`. Until `approvals` carries a real `requested_by_skill_id`,
 * we extract the slug from the name to look up autonomy state.
 */
export function parseSkillSlug(name: string): string | null {
  const m = /^([a-z0-9][a-z0-9-]*)\s*\(bot\)$/i.exec(name.trim());
  if (m) return m[1].toLowerCase();
  if (name.endsWith("-bot")) return name.slice(0, -"-bot".length).toLowerCase();
  return null;
}

export function serializeApprovalRow(
  a: Approval,
  skillLevelBySlug: Map<string, AutonomyLevel> = new Map(),
): ApprovalRowClient {
  const requestedByName = a.requestedByName ?? "—";
  const isBot = BOT_NAMES.has(requestedByName.toLowerCase()) || requestedByName.endsWith("-bot");
  const skillSlug = isBot ? parseSkillSlug(requestedByName) : null;
  const skillLevel = skillSlug ? skillLevelBySlug.get(skillSlug) ?? null : null;
  const age = formatAge(a.createdAt);
  // Auto-eligibility: a Senior or Principal originating skill earns auto-approve
  // for low-risk entity types within a 7d window. Falls back to "bot-requested"
  // heuristic when we can't resolve the skill (preserves prior behavior).
  const trustedLevel = skillLevel === "SENIOR" || skillLevel === "PRINCIPAL";
  const autoEligible =
    (trustedLevel || (isBot && !skillLevel)) &&
    (a.entityType === "work_item" || a.entityType === "plan") &&
    age.days < 7;
  return {
    id: a.id,
    entityType: a.entityType,
    entityId: a.entityId,
    status: a.status,
    title: resolveTitle(a),
    projectKey: null,
    phase: a.phase ?? null,
    requestedByName,
    isBotRequester: isBot,
    skillSlug,
    skillLevel,
    requesterNote: a.requesterNote,
    ageLabel: age.label,
    ageDays: age.days,
    isStale: age.days >= 7,
    autoEligible,
    autoReason: autoEligible
      ? skillLevel
        ? `${skillLevel.toLowerCase()} skill — auto-approve earned via 30d outcomes`
        : "Originating skill earned auto-approve via 30d outcomes"
      : "",
  };
}
