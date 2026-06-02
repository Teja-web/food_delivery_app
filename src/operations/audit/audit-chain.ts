/**
 * Audit log hash-chain — verification.
 *
 * Companion to the `coznt.audit_log_chain` BEFORE INSERT trigger. The
 * trigger maintains the chain on write; this module walks an org's chain
 * on read and reports the first divergence.
 *
 * Design choice: the verifier delegates the canonical-concat recomputation
 * to Postgres rather than re-implementing it in TS. There's exactly one
 * canonical-concat implementation (the SQL one in the trigger and below);
 * a Node mirror would drift on the first byte-level difference (timestamp
 * formatting, `jsonb_strip_nulls` ordering, etc.). The verifier joins each
 * row against the recomputed expected hash and surfaces the first row
 * where stored ≠ expected.
 */

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { getActionContext } from "@/lib/auth/context";

export type ChainVerification =
  | { ok: true; checked: number; firstAt: Date | null; lastAt: Date | null }
  | {
      ok: false;
      checked: number;
      drift: {
        rowId: string;
        rowCreatedAt: Date;
        expectedRowHash: string;
        actualRowHash: string | null;
        reason: "row_hash mismatch" | "prev_hash mismatch" | "missing row_hash";
      };
    };

/**
 * Walk one org's chain in order, recomputing each row's hash. Returns the
 * first row whose stored row_hash diverges from `sha256(prev_hash || canonical_body)`.
 * Clean chain → `{ ok: true, checked, firstAt, lastAt }`.
 *
 * Implementation note: the canonical concat is duplicated here from the
 * trigger SQL. If you change the trigger's `concat_ws` body, change this
 * one too. Both copies are intentional — keeping them adjacent in the same
 * literal makes drift visible in a code review.
 */
export async function verifyAuditChain(opts: {
  organizationId?: string;
  /** Cap on rows examined per call. Default 5,000. */
  limit?: number;
} = {}): Promise<ChainVerification> {
  let organizationId = opts.organizationId;
  if (!organizationId) {
    const ctx = await getActionContext();
    organizationId = ctx.organizationId;
  }
  const limit = opts.limit ?? 5_000;

  // Single SQL pass: window over (organization_id ordered by created_at, id),
  // pulling prev row's stored hash via lag(). For each row, compute the
  // expected_hash from lag(row_hash) + canonical body, and surface mismatches.
  const result = await db.execute(sql`
    WITH ordered AS (
      SELECT
        id,
        organization_id,
        row_hash,
        prev_hash,
        created_at,
        lag(row_hash) OVER (PARTITION BY organization_id ORDER BY created_at, id) AS expected_prev,
        encode(
          digest(
            coalesce(lag(row_hash) OVER (PARTITION BY organization_id ORDER BY created_at, id), '') ||
            concat_ws('|',
              id,
              organization_id,
              actor_type,
              coalesce(actor_id, ''),
              coalesce(actor_name, ''),
              action,
              entity_type,
              entity_id,
              coalesce(summary, ''),
              coalesce((jsonb_strip_nulls(before))::text, ''),
              coalesce((jsonb_strip_nulls(after))::text, ''),
              created_at::text
            ),
            'sha256'
          ),
          'hex'
        ) AS expected_hash,
        row_number() OVER (PARTITION BY organization_id ORDER BY created_at, id) AS rn
      FROM coznt.audit_logs
      WHERE organization_id = ${organizationId}
    )
    SELECT
      id,
      created_at,
      row_hash,
      prev_hash,
      expected_prev,
      expected_hash,
      rn
    FROM ordered
    ORDER BY rn
    LIMIT ${limit}
  `);

  const rows = (result as unknown as {
    rows: Array<{
      id: string;
      created_at: Date;
      row_hash: string | null;
      prev_hash: string | null;
      expected_prev: string | null;
      expected_hash: string;
      rn: number;
    }>;
  }).rows;

  let firstAt: Date | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (firstAt === null) firstAt = new Date(r.created_at);

    if (!r.row_hash) {
      return {
        ok: false,
        checked: i,
        drift: {
          rowId: r.id,
          rowCreatedAt: new Date(r.created_at),
          expectedRowHash: r.expected_hash,
          actualRowHash: null,
          reason: "missing row_hash",
        },
      };
    }
    if ((r.prev_hash ?? null) !== (r.expected_prev ?? null)) {
      return {
        ok: false,
        checked: i,
        drift: {
          rowId: r.id,
          rowCreatedAt: new Date(r.created_at),
          expectedRowHash: r.expected_hash,
          actualRowHash: r.row_hash,
          reason: "prev_hash mismatch",
        },
      };
    }
    if (r.row_hash !== r.expected_hash) {
      return {
        ok: false,
        checked: i,
        drift: {
          rowId: r.id,
          rowCreatedAt: new Date(r.created_at),
          expectedRowHash: r.expected_hash,
          actualRowHash: r.row_hash,
          reason: "row_hash mismatch",
        },
      };
    }
  }

  return {
    ok: true,
    checked: rows.length,
    firstAt,
    lastAt: rows.length > 0 ? new Date(rows[rows.length - 1].created_at) : null,
  };
}

/**
 * Fetch the latest row's hash — used by the /audit UI footer to show the
 * current chain head without paying for a full walk.
 */
export async function getChainHead(organizationId: string): Promise<{
  rowHash: string | null;
  createdAt: Date | null;
  rowCount: number;
}> {
  const result = await db.execute(sql`
    SELECT row_hash, created_at, count(*) OVER () AS total
    FROM coznt.audit_logs
    WHERE organization_id = ${organizationId}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `);
  const row = (result as unknown as {
    rows: Array<{ row_hash: string | null; created_at: Date; total: string | number }>;
  }).rows[0];
  if (!row) return { rowHash: null, createdAt: null, rowCount: 0 };
  return {
    rowHash: row.row_hash,
    createdAt: new Date(row.created_at),
    rowCount: typeof row.total === "string" ? parseInt(row.total, 10) : row.total,
  };
}
