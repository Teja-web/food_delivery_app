"use server";

import {
  getInterviews as _getInterviews,
  getInterview as _getInterview,
  createInterview as _createInterview,
  updateInterview as _updateInterview,
  deleteInterview as _deleteInterview,
  searchInterviews as _searchInterviews,
  confirmInterviewSlotByToken,
  declineInterviewByToken,
  syncCalendarOnUpdate,
  deleteCalendarEventsOnCancel,
} from "../operations/interviews";
import type { ProposedSlot } from "@/db/schema/interviews";
import { interviewPanelists } from "@/db/schema";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  updateInterviewIntelligence as _updateIntel,
  createInterviewIntelligence as _createIntel,
} from "../operations/intelligence";
import { getActionContext } from "@/lib/auth/context";

export async function listInterviews(opts?: {
  offset?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  where?: (table: any) => any;
}) {
  return _getInterviews(opts);
}

export async function searchInterviews(query: string, opts?: { offset?: number; limit?: number }) {
  return _searchInterviews(query, opts);
}

export async function listUpcomingInterviews(opts?: { offset?: number; limit?: number }) {
  const { and: drizzleAnd, inArray, gte, or, isNull } = await import("drizzle-orm");
  const activeStatuses = ["proposed", "confirmed"];
  return _getInterviews({
    ...opts,
    sortBy: "scheduledAt",
    sortOrder: "asc",
    where: (t: any) => drizzleAnd(
      inArray(t.status, activeStatuses),
      or(gte(t.scheduledAt, new Date()), isNull(t.scheduledAt)),
    ),
  });
}

export async function listPastInterviews(opts?: { offset?: number; limit?: number }) {
  const { and: drizzleAnd, or, inArray, lt } = await import("drizzle-orm");
  return _getInterviews({
    ...opts,
    sortBy: "scheduledAt",
    sortOrder: "desc",
    where: (t: any) => or(
      inArray(t.status, ["completed", "cancelled"]),
      lt(t.scheduledAt, new Date()),
    ),
  });
}

export async function fetchInterview(id: string) {
  return _getInterview(id);
}

async function addInterview(data: Record<string, unknown>) {
  return _createInterview(data);
}

export async function editInterview(
  id: string,
  data: Record<string, unknown>,
  panelistUserIds?: string[],
) {
  // Check if status is being changed to cancelled
  const isCancelling = data.status === "cancelled";

  await _updateInterview(id, data);

  if (panelistUserIds !== undefined) {
    await db.delete(interviewPanelists).where(eq(interviewPanelists.interviewId, id));
    if (panelistUserIds.length > 0) {
      await db.insert(interviewPanelists).values(
        panelistUserIds.map((userId) => ({
          id: nanoid(),
          interviewId: id,
          userId,
          role: "interviewer",
        })),
      );
    }
  }

  // Sync calendar events
  if (isCancelling) {
    // Delete calendar events when interview is cancelled
    await deleteCalendarEventsOnCancel(id);
  } else if (data.scheduledAt || data.durationMins || data.notes) {
    // Update calendar events if time/duration/notes changed
    await syncCalendarOnUpdate(id, {
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt as string) : undefined,
      durationMins: data.durationMins as number | undefined,
      notes: data.notes as string | undefined,
    });
  }
}

async function removeInterview(id: string) {
  return _deleteInterview(id);
}

export async function saveTranscript(
  interviewId: string,
  intelligenceId: string | null,
  transcript: string,
) {
  const ctx = await getActionContext();
  if (intelligenceId) {
    await _updateIntel(intelligenceId, { transcript });
  } else {
    await _createIntel({
      organizationId: ctx.organizationId,
      interviewId,
      transcript,
    });
  }
  await _updateInterview(interviewId, { status: "completed", transcript });
}

/**
 * Confirm an interview slot (public action - uses token for auth).
 * Called from the candidate portal when they select a time slot.
 */
export async function confirmInterviewSlot(token: string, selectedSlot: ProposedSlot) {
  return confirmInterviewSlotByToken(token, selectedSlot);
}

/**
 * Decline an interview (public action - uses token for auth).
 * Called from the candidate portal when they decline an interview.
 */
export async function declineInterview(token: string) {
  return declineInterviewByToken(token);
}
