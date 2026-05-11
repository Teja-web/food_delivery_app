import { createEntityCrud } from "@/lib/crud";
import { db } from "@/db/client";
import { interviews, scorecards, interviewPanelists } from "@/db/schema";
import { interviewSchema, scorecardSchema } from "./schemas";
import { eq, and, or, sql, inArray } from "drizzle-orm";
import type { ProposedSlot } from "@/db/schema/interviews";
import { safeRevalidate } from "@/lib/safe-revalidate";

// -- Interviews --------------------------------------------------------

const interviewCrud = createEntityCrud({
  db,
  table: interviews,
  queryKey: "interviews",
  idField: "id",
  schema: interviewSchema,
  onMutate: () => safeRevalidate("/interviews"),
  getWith: { application: { with: { role: true, candidate: true } }, stage: true, scorecards: true, intelligence: true, panelists: { with: { user: true } } },
  searchFields: ["interviewType", "notes", "transcript"],
  searchConfig: { tableName: "interviews" },
});

export const getInterviews = interviewCrud.list;
export const searchInterviews = interviewCrud.search;
const searchInterviewsSemantic = interviewCrud.searchSemantic;
export const getInterview = interviewCrud.get;
export const createInterview = interviewCrud.create;
export const updateInterview = interviewCrud.update;
export const deleteInterview = interviewCrud.delete;

// -- Interview Conflict Checking --------------------------------------------

export interface ConflictingInterview {
  id: string;
  scheduledAt: Date;
  durationMins: number;
  status: string;
  candidateName?: string;
  roleTitle?: string;
}

export interface CalendarBusySlot {
  start: string;
  end: string;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflicts: Array<{
    slot: ProposedSlot;
    userId: string;
    userName?: string;
    conflictingInterviews: ConflictingInterview[];
  }>;
  /** Calendar busy warnings (not blocking, just informational) */
  calendarWarnings: Array<{
    slot: ProposedSlot;
    userId: string;
    busySlots: CalendarBusySlot[];
  }>;
}

/**
 * Check if any proposed slots conflict with existing confirmed interviews
 * for the given panelists. Also checks Google Calendar for busy slots (warning only).
 */
export async function checkInterviewConflicts(
  panelistUserIds: string[],
  proposedSlots: ProposedSlot[],
  durationMins: number,
  excludeInterviewId?: string,
): Promise<ConflictCheckResult> {
  if (!panelistUserIds.length || !proposedSlots.length) {
    return { hasConflict: false, conflicts: [], calendarWarnings: [] };
  }

  const conflicts: ConflictCheckResult["conflicts"] = [];
  const calendarWarnings: ConflictCheckResult["calendarWarnings"] = [];

  // Get time range for calendar lookup
  const allStarts = proposedSlots.map((s) => new Date(s.startAt).getTime());
  const allEnds = proposedSlots.map((s) => {
    const start = new Date(s.startAt);
    return s.endAt ? new Date(s.endAt).getTime() : start.getTime() + durationMins * 60 * 1000;
  });
  const timeMin = new Date(Math.min(...allStarts)).toISOString();
  const timeMax = new Date(Math.max(...allEnds)).toISOString();

  // Fetch Google Calendar busy slots for all panelists (for warnings)
  let calendarBusy: Record<string, CalendarBusySlot[]> = {};
  try {
    const { getFreeBusy } = await import("@/lib/integrations/calendar");
    await import("@/lib/integrations/register-providers");
    calendarBusy = await getFreeBusy(panelistUserIds, timeMin, timeMax);
  } catch (error) {
    // Calendar integration might not be set up - continue without it
    console.warn("[checkInterviewConflicts] Could not fetch calendar busy slots:", error);
  }

  // For each proposed slot, check conflicts
  for (const slot of proposedSlots) {
    const slotStart = new Date(slot.startAt);
    const slotEnd = new Date(slot.endAt || new Date(slotStart.getTime() + durationMins * 60 * 1000));

    for (const userId of panelistUserIds) {
      // 1. Check database for conflicting Dilliznt interviews (hard conflict)
      const conflicting = await db
        .select({
          id: interviews.id,
          scheduledAt: interviews.scheduledAt,
          durationMins: interviews.durationMins,
          status: interviews.status,
        })
        .from(interviews)
        .innerJoin(interviewPanelists, eq(interviewPanelists.interviewId, interviews.id))
        .where(
          and(
            eq(interviewPanelists.userId, userId),
            inArray(interviews.status, ["confirmed", "scheduled"]),
            excludeInterviewId ? sql`${interviews.id} != ${excludeInterviewId}` : undefined,
            sql`${interviews.scheduledAt} IS NOT NULL`,
            or(
              and(
                sql`${interviews.scheduledAt} >= ${slotStart.toISOString()}`,
                sql`${interviews.scheduledAt} < ${slotEnd.toISOString()}`,
              ),
              and(
                sql`${interviews.scheduledAt} + (COALESCE(${interviews.durationMins}, 60) || ' minutes')::interval > ${slotStart.toISOString()}`,
                sql`${interviews.scheduledAt} < ${slotEnd.toISOString()}`,
              ),
              and(
                sql`${interviews.scheduledAt} <= ${slotStart.toISOString()}`,
                sql`${interviews.scheduledAt} + (COALESCE(${interviews.durationMins}, 60) || ' minutes')::interval >= ${slotEnd.toISOString()}`,
              ),
            ),
          ),
        );

      if (conflicting.length > 0) {
        conflicts.push({
          slot,
          userId,
          conflictingInterviews: conflicting.map((c) => ({
            id: c.id,
            scheduledAt: c.scheduledAt!,
            durationMins: c.durationMins ?? 60,
            status: c.status,
          })),
        });
      }

      // 2. Check Google Calendar busy slots (warning only, not blocking)
      const userBusySlots = calendarBusy[userId] ?? [];
      const overlappingBusy = userBusySlots.filter((busy) => {
        const busyStart = new Date(busy.start).getTime();
        const busyEnd = new Date(busy.end).getTime();
        const slotStartMs = slotStart.getTime();
        const slotEndMs = slotEnd.getTime();
        // Check for any overlap
        return busyStart < slotEndMs && busyEnd > slotStartMs;
      });

      if (overlappingBusy.length > 0) {
        calendarWarnings.push({
          slot,
          userId,
          busySlots: overlappingBusy,
        });
      }
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    calendarWarnings,
  };
}

/**
 * Validate that a slot can be confirmed without conflicts.
 * Called before confirming an interview slot.
 */
export async function validateSlotForConfirmation(
  interviewId: string,
  selectedSlot: ProposedSlot,
): Promise<{ valid: boolean; error?: string }> {
  // Get the interview with panelists
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, interviewId),
    with: { panelists: true },
  });

  if (!interview) {
    return { valid: false, error: "Interview not found" };
  }

  const panelistUserIds = interview.panelists
    .map((p) => p.userId)
    .filter((id): id is string => !!id);

  if (panelistUserIds.length === 0) {
    return { valid: true }; // No panelists to check
  }

  const result = await checkInterviewConflicts(
    panelistUserIds,
    [selectedSlot],
    interview.durationMins ?? 60,
    interviewId, // Exclude current interview
  );

  if (result.hasConflict) {
    const conflictInfo = result.conflicts[0];
    const conflictTime = conflictInfo.conflictingInterviews[0]?.scheduledAt;
    return {
      valid: false,
      error: `This time slot conflicts with another confirmed interview${conflictTime ? ` at ${new Date(conflictTime).toLocaleString()}` : ""}. Please select a different time.`,
    };
  }

  return { valid: true };
}

// -- Scorecards --------------------------------------------------------

const scorecardCrud = createEntityCrud({
  db,
  table: scorecards,
  queryKey: "scorecards",
  idField: "id",
  schema: scorecardSchema,
  onMutate: () => safeRevalidate("/interviews"),
  getWith: { interview: true },
  searchFields: ["reviewerName", "verdict", "notes"],
});

const getScorecards = scorecardCrud.list;
const getScorecard = scorecardCrud.get;
export const createScorecard = scorecardCrud.create;
export const updateScorecard = scorecardCrud.update;
const deleteScorecard = scorecardCrud.delete;

// -- Portal Interview Confirmation -------------------------------------

/**
 * Confirm an interview slot by candidate token (no auth required).
 * Used by candidates to accept a proposed interview slot.
 */
export async function confirmInterviewSlotByToken(
  token: string,
  selectedSlot: ProposedSlot
): Promise<{ success: boolean; error?: string }> {
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.candidateToken, token),
    with: {
      application: { with: { role: true, candidate: true } },
      panelists: true,
    },
  });

  if (!interview) {
    return { success: false, error: "Interview not found" };
  }

  if (interview.status === "confirmed") {
    return { success: false, error: "Interview already confirmed" };
  }

  if (interview.status === "cancelled") {
    return { success: false, error: "Interview has been cancelled" };
  }

  // Validate slot is one of the proposed slots
  const proposedSlots = interview.proposedSlots ?? [];
  const isValidSlot = proposedSlots.some(
    (slot) => slot.startAt === selectedSlot.startAt && slot.endAt === selectedSlot.endAt
  );

  if (!isValidSlot && proposedSlots.length > 0) {
    return { success: false, error: "Invalid time slot selected" };
  }

  // Check for scheduling conflicts with other confirmed interviews
  const conflictValidation = await validateSlotForConfirmation(interview.id, selectedSlot);
  if (!conflictValidation.valid) {
    return { success: false, error: conflictValidation.error };
  }

  await db
    .update(interviews)
    .set({
      status: "confirmed",
      scheduledAt: new Date(selectedSlot.startAt),
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(interviews.candidateToken, token));

  // Sync to Google Calendar for panelists and creator
  try {
    const { createCalendarEvent } = await import("@/lib/integrations/calendar");
    await import("@/lib/integrations/register-providers");

    const candidateName = interview.application?.candidate?.name ?? "Candidate";
    const roleTitle = interview.application?.role?.title ?? "Interview";
    const candidateEmail = interview.application?.candidate?.email;
    const durationMins = interview.durationMins ?? 60;

    const startTime = new Date(selectedSlot.startAt);
    const endTime = new Date(startTime.getTime() + durationMins * 60 * 1000);

    // Don't create Google Meet links during confirmation:
    // - LiveKit interviews (no meetingLink): should stay null, room created on join
    // - External interviews (has meetingLink): user already provided their link
    const shouldCreateMeetLink = false;

    const calendarEvent = {
      summary: `Interview: ${candidateName} for ${roleTitle}`,
      description: `Interview with ${candidateName} for the ${roleTitle} position.\n\nInterview Type: ${interview.interviewType ?? "General"}\n${interview.notes ? `Notes: ${interview.notes}` : ""}`,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      attendeeEmails: candidateEmail ? [candidateEmail] : [],
      createMeetLink: shouldCreateMeetLink,
    };

    // Create event for each panelist
    const userIdsToSync = new Set<string>();
    for (const panelist of interview.panelists ?? []) {
      if (panelist.userId) userIdsToSync.add(panelist.userId);
    }
    // Also sync for the interview creator
    if (interview.createdById) userIdsToSync.add(interview.createdById);

    let meetLink: string | undefined;
    const calendarEventIds: Record<string, string> = {};

    for (const userId of userIdsToSync) {
      const result = await createCalendarEvent(userId, calendarEvent);
      if (result?.eventId) {
        calendarEventIds[userId] = result.eventId;
      }
      if (result?.meetLink && !meetLink) {
        meetLink = result.meetLink;
      }
    }

    // Update interview with calendar event IDs (stored as JSON string)
    // Only update meetingLink if a new one was generated (for external video mode)
    // For LiveKit interviews, preserve the existing meeting link
    await db
      .update(interviews)
      .set({
        ...(meetLink && shouldCreateMeetLink ? { meetingLink: meetLink } : {}),
        calendarEventId: Object.keys(calendarEventIds).length > 0 ? JSON.stringify(calendarEventIds) : undefined,
        updatedAt: new Date()
      })
      .where(eq(interviews.candidateToken, token));
  } catch (error) {
    // Log but don't fail the confirmation if calendar sync fails
    console.error("[Interview] Failed to sync to calendar:", error);
  }

  safeRevalidate("/interviews");
  safeRevalidate("/recruit/schedule");

  return { success: true };
}

/**
 * Decline an interview by candidate token (no auth required).
 * Used by candidates to decline a proposed interview.
 */
export async function declineInterviewByToken(
  token: string
): Promise<{ success: boolean; error?: string }> {
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.candidateToken, token),
  });

  if (!interview) {
    return { success: false, error: "Interview not found" };
  }

  if (interview.status === "confirmed") {
    return { success: false, error: "Interview already confirmed" };
  }

  if (interview.status === "cancelled" || interview.status === "declined") {
    return { success: false, error: "Interview already declined" };
  }

  await db
    .update(interviews)
    .set({
      status: "declined",
      updatedAt: new Date(),
    })
    .where(eq(interviews.candidateToken, token));

  safeRevalidate("/interviews");
  safeRevalidate("/recruit/schedule");

  return { success: true };
}

/**
 * Sync calendar events when an interview is updated.
 * Updates existing calendar events with new time/details.
 */
export async function syncCalendarOnUpdate(
  interviewId: string,
  updates: {
    scheduledAt?: Date;
    durationMins?: number;
    notes?: string;
  }
): Promise<void> {
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, interviewId),
    with: {
      application: { with: { role: true, candidate: true } },
      panelists: true,
    },
  });

  if (!interview || !interview.calendarEventId || interview.status !== "confirmed") {
    return;
  }

  try {
    const { updateCalendarEvent } = await import("@/lib/integrations/calendar");
    await import("@/lib/integrations/register-providers");

    // Parse stored event IDs (JSON string mapping userId -> eventId)
    const calendarEventIds: Record<string, string> = JSON.parse(interview.calendarEventId);

    const candidateName = interview.application?.candidate?.name ?? "Candidate";
    const roleTitle = interview.application?.role?.title ?? "Interview";
    const candidateEmail = interview.application?.candidate?.email;
    const durationMins = updates.durationMins ?? interview.durationMins ?? 60;
    const scheduledAt = updates.scheduledAt ?? interview.scheduledAt;

    if (!scheduledAt) return;

    const startTime = new Date(scheduledAt);
    const endTime = new Date(startTime.getTime() + durationMins * 60 * 1000);

    const calendarEvent = {
      summary: `Interview: ${candidateName} for ${roleTitle}`,
      description: `Interview with ${candidateName} for the ${roleTitle} position.\n\nInterview Type: ${interview.interviewType ?? "General"}\n${updates.notes ?? interview.notes ? `Notes: ${updates.notes ?? interview.notes}` : ""}`,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      attendeeEmails: candidateEmail ? [candidateEmail] : [],
      createMeetLink: false, // Don't create new meet link on update
    };

    // Update event for each user that has a calendar event
    for (const [userId, eventId] of Object.entries(calendarEventIds)) {
      await updateCalendarEvent(userId, eventId, calendarEvent);
    }
  } catch (error) {
    console.error("[Interview] Failed to sync calendar on update:", error);
  }
}

/**
 * Delete calendar events when an interview is cancelled.
 */
export async function deleteCalendarEventsOnCancel(interviewId: string): Promise<void> {
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, interviewId),
  });

  if (!interview || !interview.calendarEventId) {
    return;
  }

  try {
    const { deleteCalendarEvent } = await import("@/lib/integrations/calendar");
    await import("@/lib/integrations/register-providers");

    // Parse stored event IDs (JSON string mapping userId -> eventId)
    const calendarEventIds: Record<string, string> = JSON.parse(interview.calendarEventId);

    // Delete event for each user
    for (const [userId, eventId] of Object.entries(calendarEventIds)) {
      await deleteCalendarEvent(userId, eventId);
    }

    // Clear the stored event IDs
    await db
      .update(interviews)
      .set({ calendarEventId: null, updatedAt: new Date() })
      .where(eq(interviews.id, interviewId));
  } catch (error) {
    console.error("[Interview] Failed to delete calendar events:", error);
  }
}
