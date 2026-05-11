/**
 * Dilliznt AI — simplified generate() wrapper.
 */

import { generateText as aiGenerateText, Output, NoObjectGeneratedError } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod/v4";

// -- Model setup ------------------------------------------------------

const groq = createGroq();
const openai = createOpenAI();

type GroqModelId =
  | "llama-3.1-8b-instant"
  | "llama-3.3-70b-versatile"
  | "meta-llama/llama-guard-4-12b"
  | "openai/gpt-oss-20b"
  | "openai/gpt-oss-120b";

type OpenAIModelId = "gpt-4o" | "gpt-4o-mini";

export type ModelId = GroqModelId | OpenAIModelId;

const OPENAI_MODELS = new Set<string>(["gpt-4o", "gpt-4o-mini"]);
const GROQ_MODELS = new Set<string>([
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "meta-llama/llama-guard-4-12b",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
]);

export const DEFAULT_MODEL: ModelId =
  (process.env.DEFAULT_MODEL as ModelId) || "openai/gpt-oss-120b";

export const SMALL_MODEL: ModelId =
  (process.env.SMALL_MODEL as ModelId) || "openai/gpt-oss-120b";

export function getModelInstance(modelId: ModelId = DEFAULT_MODEL) {
  if (GROQ_MODELS.has(modelId)) return groq(modelId);
  if (OPENAI_MODELS.has(modelId)) return openai(modelId);
  throw new Error(`Unknown model: ${modelId}`);
}

// -- Agent type -------------------------------------------------------

export interface Agent {
  slug: string;
  name: string;
  description?: string;
  category?: string;
  model?: ModelId;
  temperature?: number;
  /** Seed for reproducible outputs (only supported by some models) */
  seed?: number;
  systemPrompt?: string;
  outputSchema?: z.ZodType;
  functionId?: string;
}

// -- generate() -------------------------------------------------------

/**
 * Attempt to repair malformed JSON from LLM output.
 * Fixes common issues like missing opening braces in array objects.
 */
function repairMalformedJson(json: string): string {
  // Fix pattern: ,"{ or ["{  where the quote should be after the brace
  // e.g., "},"{candidateId" -> },{"candidateId"
  let repaired = json.replace(/\}","\{/g, '},{"');
  repaired = repaired.replace(/\["\{/g, '[{"');
  repaired = repaired.replace(/,"\{/g, ',{"');

  // Also handle the reverse: },"{ without proper escaping
  repaired = repaired.replace(/\},"\{/g, '},{"');

  return repaired;
}

/**
 * Try to extract and repair JSON from a failed_generation error response.
 */
function tryExtractAndRepairJson(error: unknown): object | null {
  try {
    if (!(error instanceof Error)) return null;

    // Check if error has responseBody with failed_generation
    const errorAny = error as any;
    const responseBody = errorAny.responseBody || errorAny.data?.responseBody;

    if (typeof responseBody === 'string') {
      const parsed = JSON.parse(responseBody);
      if (parsed?.error?.failed_generation) {
        const repaired = repairMalformedJson(parsed.error.failed_generation);
        return JSON.parse(repaired);
      }
    }

    // Check if error.data has the structure directly
    if (errorAny.data?.error?.failed_generation) {
      const repaired = repairMalformedJson(errorAny.data.error.failed_generation);
      return JSON.parse(repaired);
    }
  } catch {
    // Repair failed, return null
  }
  return null;
}

/**
 * Generate a deterministic seed from prompt content.
 * This ensures identical prompts produce identical seeds for reproducibility.
 */
function hashPromptToSeed(prompt: string): number {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Ensure positive integer in valid seed range
  return Math.abs(hash) % 2147483647;
}

export async function generate<TSchema extends z.ZodType>(options: {
  agent: Agent;
  prompt: string;
  output?: TSchema;
  /** Override seed for this call (useful for deterministic re-evaluation) */
  seed?: number;
}): Promise<
  TSchema extends z.ZodType
    ? { text: string; object: z.infer<TSchema> }
    : { text: string }
> {
  const { agent, prompt, output, seed } = options;
  const model = agent.model ?? DEFAULT_MODEL;
  const modelInstance = getModelInstance(model);

  const maxAttempts = output ? 3 : 1;
  let lastError: unknown;

  // Only use seed if explicitly provided (not all models support it)
  const effectiveSeed = seed ?? agent.seed;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await aiGenerateText({
        model: modelInstance as any,
        system: agent.systemPrompt ?? undefined,
        prompt,
        temperature: agent.temperature ?? undefined,
        // Only pass seed if explicitly set (Groq models don't support it)
        ...(effectiveSeed !== undefined && { seed: effectiveSeed }),
        output: output ? Output.object({ schema: output }) : undefined,
      });

      if (output) {
        if (result.output == null) {
          throw new Error(
            `Agent "${agent.slug}" returned no structured output (model: ${model}, finishReason: ${result.finishReason})`,
          );
        }
        const parsed = output.safeParse(result.output);
        if (!parsed.success) {
          throw new Error(
            `Agent "${agent.slug}" returned invalid output: ${parsed.error.message.slice(0, 200)}`,
          );
        }
        // @ts-expect-error - conditional return
        return { text: result.text, object: parsed.data };
      }

      // @ts-expect-error - conditional return
      return { text: result.text };
    } catch (error: unknown) {
      lastError = error;

      // Try to repair JSON from failed_generation before retrying
      if (output && error instanceof Error && error.message.includes("Failed to generate JSON")) {
        const repaired = tryExtractAndRepairJson(error);
        if (repaired) {
          const parsed = output.safeParse(repaired);
          if (parsed.success) {
            // @ts-expect-error - conditional return
            return { text: JSON.stringify(repaired), object: parsed.data };
          }
        }
      }

      const isRetryable =
        NoObjectGeneratedError.isInstance(error) ||
        (error instanceof Error && error.message.includes("returned no structured output")) ||
        (error instanceof Error && error.message.includes("returned invalid output")) ||
        (error instanceof Error && error.message.includes("does not match the expected schema")) ||
        (error instanceof Error && error.message.includes("Failed to generate JSON"));

      if (!isRetryable || attempt === maxAttempts) throw error;

      const delay = Math.pow(2, attempt) * 1000;
      console.warn(
        `[generate] Agent "${agent.slug}" attempt ${attempt}/${maxAttempts} failed (retrying in ${delay}ms)`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
