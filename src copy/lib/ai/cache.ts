/**
 * In-memory prompt cache for `generate()`.
 *
 * Keyed on `(agent.slug, model, sha256(systemPrompt + '\n---\n' + prompt))`.
 * Same input → same cached result, so policy re-evaluation and audit replay
 * stop paying tokens for work already done.
 *
 * Deliberate non-features:
 *   - No TTL — entries live until evicted by capacity. Inputs are content-
 *     addressed; a "new" prompt is a new key, so staleness is structural.
 *   - No cross-process sharing — `generate()` is server-process-local; a
 *     redis-backed layer can wrap this later if cross-instance hit rate
 *     becomes load-bearing.
 *   - No persistence across restarts — same reasoning; warm-up is cheap
 *     when prompts are content-addressed.
 */

import { createHash } from "node:crypto";

const MAX_ENTRIES = 500;

type Entry = { text: string; object: unknown };

const store = new Map<string, Entry>();

let hits = 0;
let misses = 0;

export function promptCacheKey(args: {
  agentSlug: string;
  model: string;
  systemPrompt: string | undefined;
  prompt: string;
}): string {
  const body = `${args.systemPrompt ?? ""}\n---\n${args.prompt}`;
  const hash = createHash("sha256").update(body).digest("hex");
  return `${args.agentSlug}:${args.model}:${hash}`;
}

export function promptCacheGet(key: string): Entry | undefined {
  const entry = store.get(key);
  if (entry) {
    // LRU touch — re-insert to bump recency.
    store.delete(key);
    store.set(key, entry);
    hits++;
    return entry;
  }
  misses++;
  return undefined;
}

export function promptCacheSet(key: string, entry: Entry): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, entry);
}

export function promptCacheStats(): { hits: number; misses: number; size: number } {
  return { hits, misses, size: store.size };
}

/** Test-only — never call from app code. */
export function _resetPromptCacheForTests(): void {
  store.clear();
  hits = 0;
  misses = 0;
}
