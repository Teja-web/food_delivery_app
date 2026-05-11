import { text, timestamp, integer, jsonb, index, unique } from "drizzle-orm/pg-core";
import { dillizntSchema } from "./schema";

// ============================================
// Voice Sessions
// ============================================

export const voiceSessionStatus = dillizntSchema.enum("voice_session_status", [
  "pending",
  "active",
  "completed",
  "failed",
  "expired",
]);

export const voiceSessionType = dillizntSchema.enum("voice_session_type", [
  "webrtc",
  "telephony",
]);

export const voiceSessions = dillizntSchema.table("voice_sessions", {
  id: text().primaryKey().notNull(),
  organizationId: text("organization_id").notNull(),
  appId: text("app_id").notNull(),
  createdById: text("created_by_id").notNull(),

  // Session type & lifecycle
  type: voiceSessionType().notNull(),
  status: voiceSessionStatus().default("pending").notNull(),

  // LiveKit room name (voice-{sessionId})
  livekitRoomName: text("livekit_room_name"),

  // Voice tier: standard (browser TTS) or premium (server TTS)
  tier: text("tier").$type<"standard" | "premium">().default("standard").notNull(),

  // Legacy room name (for backward compat during migration)
  roomName: text("room_name"),

  // Agent config snapshot (frozen at session creation)
  agentConfig: jsonb("agent_config").$type<{
    systemPrompt: string;
    model?: string;
    temperature?: number;
    voice?: string;
    voiceBackend?: "deepgram" | "openai-realtime" | "livekit";
    outputSchema?: Record<string, unknown>;
    customMetadata?: Record<string, unknown>;
  }>().notNull(),

  // Telephony fields (null for webrtc)
  phoneNumber: text("phone_number"),
  callSid: text("call_sid"),

  // Results (written by agent post-call)
  transcript: jsonb().$type<Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  }>>(),
  results: jsonb().$type<Record<string, unknown>>(),
  durationSeconds: integer("duration_seconds"),

  // Auth token for API access (results polling)
  sessionToken: text("session_token").notNull(),

  // Timestamps
  startedAt: timestamp("started_at", { mode: "string" }),
  endedAt: timestamp("ended_at", { mode: "string" }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("voice_sessions_org_app_idx").using("btree",
    table.organizationId.asc().nullsLast().op("text_ops"),
    table.appId.asc().nullsLast().op("text_ops"),
  ),
  index("voice_sessions_status_idx").using("btree", table.status.asc().nullsLast()),
  index("voice_sessions_room_idx").using("btree", table.roomName.asc().nullsLast().op("text_ops")),
  unique("voice_sessions_call_sid_unique").on(table.callSid),
]);

// Type exports
export type VoiceSession = typeof voiceSessions.$inferSelect;
export type NewVoiceSession = typeof voiceSessions.$inferInsert;
export type VoiceSessionStatus = typeof voiceSessionStatus.enumValues[number];
export type VoiceSessionType = typeof voiceSessionType.enumValues[number];
