/**
 * Interviews list serialization — single source of truth for transforming
 * Drizzle relational query results into client-safe props.
 *
 * Types flow from: DB schema ($inferSelect) → serialize → client component.
 * No manual interfaces in the client — import from here.
 */

import type { Interview, InterviewPanelist } from "@/db/schema/interviews";
import type { Application } from "@/db/schema/applications";
import type { Candidate } from "@/db/schema/candidates";
import type { Role } from "@/db/schema/roles";

// -- Derived types (what the client receives) ---------------------------

export interface SerializedListInterview {
  id: string;
  candidateName: string | null;
  roleName: string | null;
  panelistNames: string[];
  interviewType: string | null;
  scheduledAt: string | null;
  durationMins: number | null;
  evidenceTarget: string | null;
  status: string;
}

export interface InterviewsListProps {
  upcoming: SerializedListInterview[];
  upcomingTotal: number;
  past: SerializedListInterview[];
  pastTotal: number;
}

// -- Helpers -------------------------------------------------------------

function serializeDate(d: Date | string | null): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

// -- Serializer ----------------------------------------------------------

type PanelistWithUser = InterviewPanelist & { user?: { name: string } | null };

type InterviewWithRelations = Interview & {
  application?: (Application & { candidate?: Candidate; role?: Role }) | null;
  panelists?: PanelistWithUser[];
};

export function serializeListInterview(iv: InterviewWithRelations): SerializedListInterview {
  return {
    id: iv.id,
    candidateName: iv.application?.candidate?.name || null,
    roleName: iv.application?.role?.title || null,
    panelistNames: (iv.panelists ?? []).map((p) => p.user?.name ?? "Unknown").filter(Boolean),
    interviewType: iv.interviewType,
    scheduledAt: serializeDate(iv.scheduledAt),
    durationMins: iv.durationMins,
    evidenceTarget: iv.evidenceTarget,
    status: iv.status,
  };
}

