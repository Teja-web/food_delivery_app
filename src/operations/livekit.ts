/**
 * LiveKit operations — token minting, room management, recording.
 * This is the ONLY file that imports livekit-server-sdk.
 */

import {
  AccessToken,
  VideoGrant,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  RoomConfiguration,
  RoomAgentDispatch,
  AgentDispatchClient,
} from "livekit-server-sdk";
import { db } from "@/db/client";
import { interviews, interviewPanelists } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const LIVEKIT_URL = process.env.LIVEKIT_URL!;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;

// -- Types ----------------------------------------------------------

export type ParticipantRole = "panelist" | "candidate";

export interface RoomConnectionDetails {
  serverUrl: string;
  roomName: string;
  participantToken: string;
  participantName: string;
  participantRole: ParticipantRole;
  participantIdentity: string; // userId for logged-in users, candidate token for invite links
}

// -- Room availability window --------------------------------------

const ROOM_OPEN_BEFORE_MINS = 15;
const ROOM_CLOSE_AFTER_MINS = 30;

export function getRoomWindow(scheduledAt: Date, durationMins: number) {
  const opensAt = new Date(scheduledAt.getTime() - ROOM_OPEN_BEFORE_MINS * 60_000);
  const closesAt = new Date(scheduledAt.getTime() + (durationMins + ROOM_CLOSE_AFTER_MINS) * 60_000);
  return { opensAt, closesAt };
}

export function isRoomOpen(scheduledAt: Date | null, durationMins: number | null): boolean {
  if (!scheduledAt) return false;
  const { opensAt, closesAt } = getRoomWindow(scheduledAt, durationMins ?? 45);
  const now = new Date();
  return now >= opensAt && now <= closesAt;
}

// -- Token minting --------------------------------------------------

async function mintToken(opts: {
  roomName: string;
  identity: string;
  name: string;
  role: ParticipantRole;
  roomConfig?: RoomConfiguration;
}): Promise<string> {
  const grant: VideoGrant = {
    room: opts.roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    canUpdateOwnMetadata: true,
  };

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: opts.identity,
    name: opts.name,
    ttl: "5m",
    metadata: JSON.stringify({ role: opts.role }),
  });
  token.addGrant(grant);
  if (opts.roomConfig) {
    token.roomConfig = opts.roomConfig;
  }

  return await token.toJwt();
}

// -- Agent dispatch config ------------------------------------------

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || "transcriber";

const agentDispatch = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

function transcriptionRoomConfig(interviewId: string): RoomConfiguration {
  return new RoomConfiguration({
    metadata: JSON.stringify({ interviewId }),
    agents: [
      new RoomAgentDispatch({
        agentName: AGENT_NAME,
        metadata: JSON.stringify({ interviewId }),
      }),
    ],
  });
}

/**
 * Ensure the transcriber agent is dispatched to a room.
 * RoomAgentDispatch in the token only fires on room creation —
 * if the room already exists (e.g. after a rejoin or agent crash),
 * we explicitly dispatch a new agent.
 */
async function ensureAgentDispatched(roomName: string, interviewId: string) {
  try {
    const dispatches = await agentDispatch.listDispatch(roomName);
    const hasActive = dispatches.length > 0;
    if (!hasActive) {
      await agentDispatch.createDispatch(roomName, AGENT_NAME, {
        metadata: JSON.stringify({ interviewId }),
      });
    }
  } catch {
    // Room doesn't exist yet — agent will be dispatched via roomConfig on creation
  }
}

// -- Join via session (logged-in user) ------------------------------

export async function joinRoomAsUser(
  interviewId: string,
  userId: string,
  userName: string,
  userEmail?: string,
): Promise<RoomConnectionDetails> {
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, interviewId),
    with: { panelists: true, application: { with: { candidate: true } } },
  });

  if (!interview) throw new Error("Interview not found");

  if (!isRoomOpen(interview.scheduledAt, interview.durationMins)) {
    throw new Error("Room is not available at this time");
  }

  // Determine role: panelist or candidate
  const isPanelist = interview.panelists?.some((p) => p.userId === userId);
  const candidate = interview.application?.candidate;
  const isCandidate = userEmail && candidate?.email === userEmail;

  if (!isPanelist && !isCandidate) {
    throw new Error("You are not a participant in this interview");
  }

  const role: ParticipantRole = isPanelist ? "panelist" : "candidate";
  const roomName = `interview-${interviewId}`;
  const identity = `user-${userId}`;

  // Attach agent dispatch so whoever creates the room first triggers the transcriber
  const participantToken = await mintToken({
    roomName, identity, name: userName, role,
    roomConfig: transcriptionRoomConfig(interviewId),
  });

  // If room already exists (rejoin / agent crash), ensure agent is dispatched
  await ensureAgentDispatched(roomName, interviewId);

  return {
    serverUrl: LIVEKIT_URL,
    roomName,
    participantToken,
    participantName: userName,
    participantRole: role,
    participantIdentity: userId,
  };
}

// -- Join via invite token (external participants) ------------------

export async function joinRoomByInviteToken(
  interviewId: string,
  inviteToken: string,
): Promise<RoomConnectionDetails> {
  const interview = await db.query.interviews.findFirst({
    where: and(
      eq(interviews.id, interviewId),
      eq(interviews.candidateToken, inviteToken),
    ),
    with: { application: { with: { candidate: true } } },
  });

  if (!interview) throw new Error("Invalid invite token");

  if (!isRoomOpen(interview.scheduledAt, interview.durationMins)) {
    throw new Error("Room is not available at this time");
  }

  const candidateName = interview.application?.candidate?.name ?? "Candidate";
  const candidateId = interview.candidateId ?? "unknown";
  const roomName = `interview-${interviewId}`;
  const identity = `candidate-${candidateId}`;

  const participantToken = await mintToken({
    roomName,
    identity,
    name: candidateName,
    role: "candidate",
    roomConfig: transcriptionRoomConfig(interviewId),
  });

  // If room already exists (rejoin / agent crash), ensure agent is dispatched
  await ensureAgentDispatched(roomName, interviewId);

  return {
    serverUrl: LIVEKIT_URL,
    roomName,
    participantToken,
    participantName: candidateName,
    participantRole: "candidate",
    participantIdentity: candidateId,
  };
}

// -- Recording -----------------------------------------------------

function getEgressClient() {
  // EgressClient expects https:// URL, not wss://
  const httpUrl = LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://");
  return new EgressClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

function getRecordingOutput(organizationId: string, interviewId: string): EncodedFileOutput {
  const s3 = new S3Upload({
    accessKey: process.env.S3_KEY_ID!,
    secret: process.env.S3_KEY_SECRET!,
    endpoint: process.env.S3_ENDPOINT!,
    bucket: process.env.S3_BUCKET!,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: true,
  });

  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: `${organizationId}/interview-${interviewId}-{time}.mp4`,
    output: { case: "s3", value: s3 },
  });
}

export async function startRecording(interviewId: string): Promise<{ egressId: string }> {
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, interviewId),
  });
  if (!interview) throw new Error("Interview not found");
  if (interview.recordingStatus === "recording") {
    throw new Error("Recording is already in progress");
  }

  if (!process.env.S3_BUCKET || !process.env.S3_KEY_ID) {
    throw new Error("Feature not available. Please contact your administrator.");
  }

  const roomName = `interview-${interviewId}`;
  const egress = getEgressClient();

  const output = getRecordingOutput(interview.organizationId, interviewId);

  const info = await egress.startRoomCompositeEgress(roomName, output, {
    audioOnly: true, // Record audio only for STT transcript
  });

  const egressId = info.egressId;

  await db
    .update(interviews)
    .set({
      recordingEgressId: egressId,
      recordingStatus: "recording",
      updatedAt: new Date(),
    })
    .where(eq(interviews.id, interviewId));

  return { egressId };
}

export async function stopRecording(interviewId: string): Promise<void> {
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, interviewId),
  });
  if (!interview) throw new Error("Interview not found");
  if (interview.recordingStatus !== "recording" || !interview.recordingEgressId) {
    throw new Error("No active recording to stop");
  }

  const egress = getEgressClient();
  const info = await egress.stopEgress(interview.recordingEgressId);

  // Extract file URL from egress result
  const fileResult = info.fileResults?.[0];
  const recordingUrl = fileResult?.location ?? fileResult?.filename ?? null;

  await db
    .update(interviews)
    .set({
      recordingStatus: "processing",
      recordingUrl,
      updatedAt: new Date(),
    })
    .where(eq(interviews.id, interviewId));
}

export async function getRecordingStatus(interviewId: string) {
  const interview = await db.query.interviews.findFirst({
    where: eq(interviews.id, interviewId),
    columns: { recordingStatus: true, recordingUrl: true, recordingEgressId: true },
  });
  if (!interview) throw new Error("Interview not found");
  return {
    status: interview.recordingStatus ?? "none",
    url: interview.recordingUrl,
  };
}
