"use server";

import { getActionContext } from "@/lib/auth/context";
import {
  isRoomOpen,
  startRecording as startRecordingOp,
  stopRecording as stopRecordingOp,
  getRecordingStatus as getRecordingStatusOp,
} from "@/operations/livekit";
import { db } from "@/db/client";
import { interviews } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Check if the video room is currently available for an interview.
 */
async function checkRoomAvailability(
  interviewId: string,
): Promise<{ available: boolean; opensAt: string | null; closesAt: string | null }> {
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, interviewId),
    columns: { scheduledAt: true, durationMins: true },
  });

  if (!interview?.scheduledAt) {
    return { available: false, opensAt: null, closesAt: null };
  }

  const { getRoomWindow } = await import("@/operations/livekit");
  const { opensAt, closesAt } = getRoomWindow(interview.scheduledAt, interview.durationMins ?? 45);

  return {
    available: isRoomOpen(interview.scheduledAt, interview.durationMins),
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
  };
}

/**
 * Start recording an interview room. Panelists only.
 */
export async function startInterviewRecording(
  interviewId: string,
): Promise<{ egressId: string }> {
  await getActionContext(); // Verify authenticated
  return startRecordingOp(interviewId);
}

/**
 * Stop recording an interview room. Panelists only.
 */
export async function stopInterviewRecording(
  interviewId: string,
): Promise<void> {
  await getActionContext();
  return stopRecordingOp(interviewId);
}

/**
 * Get current recording status for an interview.
 */
async function getInterviewRecordingStatus(
  interviewId: string,
): Promise<{ status: string; url: string | null }> {
  return getRecordingStatusOp(interviewId);
}

