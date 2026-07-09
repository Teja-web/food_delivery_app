/**
 * Coznt AI — simplified generate() wrapper.
 */

import {
  generateText as aiGenerateText,
  Output,
  NoObjectGeneratedError,
  type LanguageModelUsage,
} from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod/v4";

import { promptCacheGet, promptCacheKey, promptCacheSet } from "./cache";
export { promptCacheStats } from "./cache";

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

export interface GenerateUsage {
  modelId: ModelId;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  cacheHit: boolean;
  estimatedCostUsd: number | null;
  pricing: {
    inputUsdPer1M: number | null;
    cachedInputUsdPer1M: number | null;
    outputUsdPer1M: number | null;
    source: "static" | "unavailable";
  };
}

interface ModelPricing {
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  cachedInputUsdPer1M?: number;
}

const MODEL_PRICING_USD_PER_1M: Partial<Record<ModelId, ModelPricing>> = {
  "openai/gpt-oss-20b": {
    inputUsdPer1M: 0.075,
    cachedInputUsdPer1M: 0.0375,
    outputUsdPer1M: 0.30,
  },
  "openai/gpt-oss-120b": {
    inputUsdPer1M: 0.15,
    cachedInputUsdPer1M: 0.075,
    outputUsdPer1M: 0.60,
  },
  "llama-3.1-8b-instant": {
    inputUsdPer1M: 0.05,
    outputUsdPer1M: 0.08,
  },
  "llama-3.3-70b-versatile": {
    inputUsdPer1M: 0.59,
    outputUsdPer1M: 0.79,
  },
  "gpt-4o-mini": {
    inputUsdPer1M: 0.15,
    outputUsdPer1M: 0.60,
  },
  "gpt-4o": {
    inputUsdPer1M: 2.50,
    outputUsdPer1M: 10.00,
  },
};

const OPENAI_MODELS = new Set<ModelId>(["gpt-4o", "gpt-4o-mini"]);
const GROQ_MODELS = new Set<ModelId>([
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "meta-llama/llama-guard-4-12b",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
]);
const SUPPORTED_MODELS = new Set<ModelId>([
  ...OPENAI_MODELS,
  ...GROQ_MODELS,
]);

function envModel(name: "DEFAULT_MODEL" | "SMALL_MODEL"): ModelId {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Set ${name} in your environment to one of: ${[...SUPPORTED_MODELS].join(", ")}.`,
    );
  }
  if (!SUPPORTED_MODELS.has(value as ModelId)) {
    throw new Error(
      `Unsupported ${name} "${value}". Use one of: ${[...SUPPORTED_MODELS].join(", ")}.`,
    );
  }
  return value as ModelId;
}

export const DEFAULT_MODEL: ModelId = envModel("DEFAULT_MODEL");

export const SMALL_MODEL: ModelId = envModel("SMALL_MODEL");

export function getModelInstance(modelId: ModelId) {
  if (GROQ_MODELS.has(modelId)) return groq(modelId);
  if (OPENAI_MODELS.has(modelId)) return openai(modelId);
  throw new Error(
    `Unsupported model "${modelId}". Use one of: ${[...SUPPORTED_MODELS].join(", ")}.`,
  );
}

function normalizeUsage(
  modelId: ModelId,
  usage: LanguageModelUsage | undefined,
  cacheHit: boolean,
): GenerateUsage {
  const inputTokens = usage?.inputTokens ?? null;
  const outputTokens = usage?.outputTokens ?? null;
  const totalTokens = usage?.totalTokens ?? null;
  const cachedInputTokens =
    usage?.inputTokenDetails?.cacheReadTokens ??
    usage?.cachedInputTokens ??
    null;
  const reasoningTokens =
    usage?.outputTokenDetails?.reasoningTokens ??
    usage?.reasoningTokens ??
    null;
  const pricing = MODEL_PRICING_USD_PER_1M[modelId] ?? null;

  if (cacheHit) {
    return {
      modelId,
      inputTokens,
      outputTokens,
      totalTokens,
      cachedInputTokens,
      reasoningTokens,
      cacheHit,
      estimatedCostUsd: 0,
      pricing: {
        inputUsdPer1M: pricing?.inputUsdPer1M ?? null,
        cachedInputUsdPer1M: pricing?.cachedInputUsdPer1M ?? null,
        outputUsdPer1M: pricing?.outputUsdPer1M ?? null,
        source: pricing ? "static" : "unavailable",
      },
    };
  }

  const noCacheInputTokens =
    usage?.inputTokenDetails?.noCacheTokens ??
    (inputTokens != null && cachedInputTokens != null
      ? Math.max(0, inputTokens - cachedInputTokens)
      : inputTokens);
  const cachedTokens = cachedInputTokens ?? 0;
  const output = outputTokens ?? 0;
  const estimatedCostUsd = pricing && noCacheInputTokens != null && outputTokens != null
    ? (
        (noCacheInputTokens * pricing.inputUsdPer1M) +
        (cachedTokens * (pricing.cachedInputUsdPer1M ?? pricing.inputUsdPer1M)) +
        (output * pricing.outputUsdPer1M)
      ) / 1_000_000
    : null;

  return {
    modelId,
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    reasoningTokens,
    cacheHit,
    estimatedCostUsd,
    pricing: {
      inputUsdPer1M: pricing?.inputUsdPer1M ?? null,
      cachedInputUsdPer1M: pricing?.cachedInputUsdPer1M ?? null,
      outputUsdPer1M: pricing?.outputUsdPer1M ?? null,
      source: pricing ? "static" : "unavailable",
    },
  };
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
  /** When false, bypass the prompt cache for this call. Default: true. */
  cache?: boolean;
}): Promise<
  TSchema extends z.ZodType
    ? { text: string; object: z.infer<TSchema>; usage: GenerateUsage }
    : { text: string; usage: GenerateUsage }
> {
  const { agent, prompt, output, seed, cache = true } = options;
  const model = agent.model ?? DEFAULT_MODEL;
  const modelInstance = getModelInstance(model);

  // Cache check — same agent + same model + same effective prompt
  // returns the prior result without paying tokens. Only structured
  // outputs are cached so the typed `object` is always present.
  const cacheKey =
    cache && output
      ? promptCacheKey({
          agentSlug: agent.slug,
          model,
          systemPrompt: agent.systemPrompt,
          prompt,
        })
      : null;
  if (cacheKey) {
    const hit = promptCacheGet(cacheKey);
    if (hit) {
      // @ts-expect-error - conditional return
      return { text: hit.text, object: hit.object, usage: normalizeUsage(model, undefined, true) };
    }
  }

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
        const usage = normalizeUsage(model, result.totalUsage ?? result.usage, false);
        if (cacheKey) promptCacheSet(cacheKey, { text: result.text, object: parsed.data });
        // @ts-expect-error - conditional return
        return { text: result.text, object: parsed.data, usage };
      }

      // @ts-expect-error - conditional return
      return { text: result.text, usage: normalizeUsage(model, result.totalUsage ?? result.usage, false) };
    } catch (error: unknown) {
      lastError = error;

      // Try to repair JSON from failed_generation before retrying
      if (output && error instanceof Error && error.message.includes("Failed to generate JSON")) {
        const repaired = tryExtractAndRepairJson(error);
        if (repaired) {
          const parsed = output.safeParse(repaired);
          if (parsed.success) {
            const text = JSON.stringify(repaired);
            if (cacheKey) promptCacheSet(cacheKey, { text, object: parsed.data });
            // @ts-expect-error - conditional return
            return { text, object: parsed.data, usage: normalizeUsage(model, undefined, false) };
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
