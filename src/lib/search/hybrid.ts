/**
 * Hybrid Search
 *
 * Combines vector similarity (pgvector) with full-text search (BM25).
 */

import { sql } from "drizzle-orm";
import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import type { SearchResult, SearchOptions } from "./types";

type DrizzleDB = {
  execute: (query: ReturnType<typeof sql>) => Promise<{ rows: any[] }>;
};

/**
 * Generate embedding for query text
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: text.toLowerCase().trim().slice(0, 8000),
  });
  return embedding;
}

/**
 * Hybrid search combining vector similarity + full-text (BM25)
 */
export async function searchHybrid(
  db: DrizzleDB,
  query: string,
  tableName: string,
  options: SearchOptions,
  weights: { vector?: number; text?: number } = {},
): Promise<SearchResult<{ id: string }>[]> {
  const { organizationId, limit = 20, threshold = 0, join: extraJoin, where: extraWhere } = options;
  const vectorWeight = weights.vector ?? 0.5;
  const textWeight = weights.text ?? 0.5;

  if (!query.trim()) return [];

  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // Convert query to tsquery format
  const tsQuery = query
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => `${word}:*`)
    .join(" | ");

  // Visibility filter. Embeddings stay stamped with the creator org and act
  // as a partition key; visibility comes from a query-time predicate.
  //
  // - candidates: join through org_candidates so a candidate created by Org A
  //   but added to Org B's pool is visible to both (vendor flow).
  // - everything else: the creator stamp equals the visible org.
  //
  // (Phase 2 of vendor-and-attribution-plan.md.)
  const orgFilter = organizationId
    ? tableName === "candidates"
      ? sql`EXISTS (
          SELECT 1 FROM dilliznt.org_candidates oc
          WHERE oc.candidate_id = d.record_id
            AND oc.organization_id = ${organizationId}
        )`
      : sql`d.organization_id = ${organizationId}`
    : sql`1=1`;

  const joinClause = extraJoin ?? sql``;
  const whereClause = extraWhere ? sql`AND ${extraWhere}` : sql``;

  // Vector-only fallback for invalid tsquery
  if (!tsQuery) {
    const vectorOnly = await db.execute(sql`
      SELECT
        d.record_id,
        (1 - (d.embedding <=> ${embeddingStr}::vector)) as combined_score
      FROM dilliznt.documents d
      ${joinClause}
      WHERE d.embedding IS NOT NULL
        AND d.table_name = ${tableName}
        AND ${orgFilter}
        ${whereClause}
      ORDER BY d.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `);

    if (!vectorOnly.rows || vectorOnly.rows.length === 0) return [];

    return vectorOnly.rows
      .map((r: any) => ({
        record: { id: String(r.record_id) },
        score: Number(r.combined_score) * vectorWeight,
      }))
      .filter((r) => r.record.id && r.score >= threshold);
  }

  // Hybrid: vector similarity + BM25 full-text
  const results = await db.execute(sql`
    WITH vector_search AS (
      SELECT
        d.record_id,
        (1 - (d.embedding <=> ${embeddingStr}::vector)) as similarity
      FROM dilliznt.documents d
      ${joinClause}
      WHERE d.embedding IS NOT NULL
        AND d.table_name = ${tableName}
        AND ${orgFilter}
        ${whereClause}
      ORDER BY d.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit * 2}
    ),
    text_search AS (
      SELECT
        d.record_id,
        ts_rank(to_tsvector('english', d.content), to_tsquery('english', ${tsQuery})) as text_rank
      FROM dilliznt.documents d
      ${joinClause}
      WHERE d.table_name = ${tableName}
        AND ${orgFilter}
        AND d.content IS NOT NULL
        AND to_tsvector('english', d.content) @@ to_tsquery('english', ${tsQuery})
        ${whereClause}
    ),
    text_normalized AS (
      SELECT
        record_id,
        CASE
          WHEN MAX(text_rank) OVER () > 0
          THEN text_rank / MAX(text_rank) OVER ()
          ELSE 0
        END as text_score
      FROM text_search
    )
    SELECT
      COALESCE(v.record_id, t.record_id) as record_id,
      COALESCE(v.similarity, 0) as vector_score,
      COALESCE(t.text_score, 0) as text_score,
      (COALESCE(v.similarity, 0) * ${vectorWeight} +
       COALESCE(t.text_score, 0) * ${textWeight}) as combined_score
    FROM vector_search v
    FULL OUTER JOIN text_normalized t ON v.record_id = t.record_id
    ORDER BY combined_score DESC
    LIMIT ${limit}
  `);

  if (!results.rows || results.rows.length === 0) return [];

  return results.rows
    .map((r: any) => ({
      record: { id: String(r.record_id) },
      score: Number(r.combined_score),
    }))
    .filter((r) => r.record.id && r.score >= threshold);
}
