/**
 * Portal Coach AI Route
 *
 * Career coach for candidates in the portal.
 * Uses candidate-scoped tools with privacy-stripped data.
 */

import { streamText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { createPortalCoachTools } from "./tools";
import { requireCandidateContext } from "@/lib/auth/context";
import { db } from "@/db/client";
import { orgCandidates } from "@/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 120;

const AGENT_MODEL = process.env.AGENT_MODEL ?? "gpt-4o-mini";
const agentModel = openai(AGENT_MODEL);

const COACH_SYSTEM_PROMPT = `You are a career coach for a candidate in the talent portal.
Use your tools to access the candidate's real data before making claims.
Be honest, specific, and actionable.

You have tools to look up the candidate's profile, opportunities, interviews,
prep history, advisory insights, and growth stats. Always ground your advice
in their actual data.

When the candidate asks about interview prep, use their interview schedule and
job details to give targeted advice. When they ask about opportunities, reference
their actual pipeline. When they ask about growth, reference their prep stats
and readiness scores.

Be warm but direct. If their profile is thin, say so and help them improve it.

Current date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages: chatMessages = [], timezone = "UTC" } = body;

    // Get candidate context (portal auth)
    const ctx = await requireCandidateContext();
    const primary = ctx.linkedCandidates[0];

    if (!primary) {
      return Response.json({ error: "No linked candidate" }, { status: 404 });
    }

    // Coach is a candidate-level chat. Derive org from the candidate's
    // org_candidates membership (any active row) — that's the org whose data
    // the coach tools will scope to and bill against. Portal-only candidates
    // (no membership row) can't run the coach.
    const membership = await db.query.orgCandidates.findFirst({
      where: eq(orgCandidates.candidateId, primary.id),
      columns: { organizationId: true },
    });
    if (!membership) {
      return Response.json({ error: "No partner organization yet" }, { status: 409 });
    }
    const organizationId = membership.organizationId;

    // Create tools with request-scoped context (closure-based, no shared state)
    const tools = createPortalCoachTools({
      email: ctx.email,
      candidateId: primary.id,
      organizationId,
      timezone,
    });

    // Build messages with system prompt, filtering out invalid messages
    // useChat may send content as string or as parts array
    const validMessages = chatMessages
      .filter((msg: Record<string, unknown>) => {
        if (!msg.role) return false;
        // Content can be string or parts array
        if (typeof msg.content === "string" && msg.content) return true;
        if (Array.isArray(msg.parts) && msg.parts.length > 0) return true;
        return false;
      })
      .map((msg: Record<string, unknown>) => {
        // Extract content from string or parts
        let content = "";
        if (typeof msg.content === "string") {
          content = msg.content;
        } else if (Array.isArray(msg.parts)) {
          content = msg.parts
            .filter((p: { type?: string; text?: string }) => p.type === "text" && p.text)
            .map((p: { text: string }) => p.text)
            .join("");
        }
        return {
          role: msg.role as "user" | "assistant",
          content,
        };
      })
      .filter((msg: { role: string; content: string }) => msg.content); // Final filter for non-empty content

    // Ensure we have at least one user message
    if (validMessages.length === 0) {
      return Response.json({ error: "No message provided" }, { status: 400 });
    }

    const messages = [
      { role: "system" as const, content: COACH_SYSTEM_PROMPT },
      ...validMessages,
    ];

    // Stream response
    const result = streamText({
      model: agentModel,
      messages,
      tools,
      stopWhen: stepCountIs(10),
      onError: (error) => {
        console.error("[Portal Coach] Stream error:", error);
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("[Portal Coach] Error:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
