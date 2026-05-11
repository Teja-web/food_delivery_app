/**
 * Ask Assistant Agent
 *
 * Conversational recruiting assistant with tool access.
 * Used by the /api/ai/ask endpoint — streams text responses
 * using auto-generated entity tools + insight tools.
 */

import { askAssistantPrompt } from "../prompts/ask-assistant";

export const askAssistantAgent = {
  slug: "ask-assistant" as const,
  name: "Ask Assistant",
  description:
    "Conversational recruiting assistant. Answers questions about candidates, roles, pipeline health, and hiring metrics using entity tools.",
  category: "conversational" as const,
  temperature: 0.3,
  systemPrompt: askAssistantPrompt,
};
