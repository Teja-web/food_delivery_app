/**
 * Speech-to-Speech Coach API Route
 *
 * Simplified coach endpoint for voice conversations.
 * Streams text responses for TTS conversion on the client.
 */

import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { requireCandidateContext } from "@/lib/auth/context";

export const maxDuration = 60;

const AGENT_MODEL = process.env.AGENT_MODEL ?? "gpt-4o-mini";
const agentModel = openai(AGENT_MODEL);

const VOICE_COACH_SYSTEM_PROMPT = `You are a friendly career coach having a voice conversation with a candidate.

Guidelines for voice responses:
- Keep responses concise (2-3 sentences max) since they'll be spoken aloud
- Be conversational and warm
- Avoid bullet points, lists, or formatting - speak naturally
- Don't use asterisks, markdown, or special characters
- If asked a complex question, give a brief answer and offer to elaborate`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages: chatMessages = [], interviewId, roleArchetype } = body;

    // Verify candidate auth
    const ctx = await requireCandidateContext();
    const primary = ctx.linkedCandidates[0];

    if (!primary) {
      return Response.json({ error: "No linked candidate" }, { status: 404 });
    }

    // Build context-aware system prompt
    const currentDate = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    let systemPrompt = `${VOICE_COACH_SYSTEM_PROMPT}\n\nCurrent date: ${currentDate}`;
    if (roleArchetype) {
      systemPrompt += `\n\nThe candidate is preparing for a ${roleArchetype} role.`;
    }
    if (interviewId) {
      systemPrompt += `\n\nThis is an interview prep session.`;
    }

    // Filter and normalize messages
    const validMessages = chatMessages
      .filter((msg: { role?: string; content?: string }) => msg.role && msg.content)
      .map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

    if (validMessages.length === 0) {
      return Response.json({ error: "No message provided" }, { status: 400 });
    }

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...validMessages,
    ];

    const result = streamText({
      model: agentModel,
      messages,
      onError: (error) => {
        console.error("[Coach STS] Stream error:", error);
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("[Coach STS] Error:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
