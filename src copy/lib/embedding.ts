/**
 * Embedding Provider
 *
 * Pluggable embedding interface. Provider is set at worker startup,
 * used by embedding tasks to generate vectors.
 */

import { createLogger } from "./logger";

const log = createLogger("embedding");

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

let provider: EmbeddingProvider | null = null;

export function setEmbeddingProvider(p: EmbeddingProvider): void {
  provider = p;
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!provider) {
    log.warn("No embedding provider configured, skipping");
    return null;
  }
  try {
    return await provider.embed(text);
  } catch (error) {
    log.error("Embedding generation failed", error);
    return null;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  if (!provider) {
    log.warn("No embedding provider configured, skipping");
    return texts.map(() => null);
  }
  try {
    return await provider.embedBatch(texts);
  } catch (error) {
    log.error("Embedding generation failed", error);
    return texts.map(() => null);
  }
}
