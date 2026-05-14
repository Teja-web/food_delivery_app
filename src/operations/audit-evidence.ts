/**
 * Audit evidence packet — tamper-evident export envelope.
 *
 * Wraps a `queryAuditLog` result in a structure that a compliance reviewer
 * can verify after the fact. Three parts:
 *
 *   header  — query parameters, export time + actor, app version, chain
 *             head hash, and the result of `verifyAuditChain` at export
 *             time so the reviewer knows the chain was intact when the
 *             packet was generated
 *   body    — rows + each audit_log row's `row_hash` (skill_outcome rows
 *             carry their schema-stable signature instead)
 *   receipt — sha256(canonical(header) ‖ canonical(body)), so editing
 *             either piece breaks the receipt
 *
 * Verification by an external reviewer:
 *   1. Recompute `receipt` from the supplied header + body — must match.
 *   2. Re-run `verifyAuditChain` against the live DB up to `header.chainHead.rowHash`
 *      to confirm the chain still hashes to the same head. Differences after
 *      that point are post-export inserts (legitimate) — anything *before*
 *      `chainHead.createdAt` that drifts is tampering.
 *
 * NOTE: the packet receipt is unauthenticated — anyone with write access to
 * the file can recompute it. The chain itself is the load-bearing tamper
 * signal. The receipt is a fast sanity check on the packet shape.
 */

import { createHash } from "node:crypto";

import { getActionContext } from "@/lib/auth/context";
import {
  queryAuditLog,
  type AuditQuery,
  type UnifiedAuditRow,
} from "@/operations/audit";
import {
  getChainHead,
  verifyAuditChain,
  type ChainVerification,
} from "@/operations/audit-chain";

export const EVIDENCE_PACKET_VERSION = "coznt.audit.evidence.v1" as const;

export interface EvidencePacketHeader {
  packetType: typeof EVIDENCE_PACKET_VERSION;
  generatedAt: string;
  generatedBy: {
    organizationId: string;
    actorId: string | null;
    actorName: string | null;
  };
  app: {
    version: string;
    /** Brief description of the exporter implementation — for forensics. */
    exporter: "audit-evidence@1";
  };
  query: {
    scope: AuditQuery["scope"];
    from: string;
    to: string;
    actorType: AuditQuery["actorType"] | null;
    limit: number;
  };
  chainHead: {
    rowHash: string | null;
    createdAt: string | null;
    rowCount: number;
  };
  chainVerification: ChainVerification;
  rowCount: number;
}

export interface EvidencePacketRow {
  id: string;
  occurredAt: string;
  source: UnifiedAuditRow["source"];
  actorType: UnifiedAuditRow["actorType"];
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  projectId: string | null;
  projectName: string | null;
  summary: string | null;
  severity: UnifiedAuditRow["severity"];
  verdict: UnifiedAuditRow["verdict"];
  signature: string;
}

export interface EvidencePacket {
  header: EvidencePacketHeader;
  body: { rows: EvidencePacketRow[] };
  receipt: {
    algorithm: "sha256";
    /** Hash over `JSON.stringify(header) + "\n" + JSON.stringify(body)`. */
    hash: string;
  };
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function rowToEvidence(row: UnifiedAuditRow): EvidencePacketRow {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    source: row.source,
    actorType: row.actorType,
    actorName: row.actorName,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    projectId: row.projectId,
    projectName: row.projectName,
    summary: row.summary,
    severity: row.severity,
    verdict: row.verdict,
    signature: row.signature,
  };
}

export async function buildEvidencePacket(
  query: AuditQuery,
  appVersion: string,
): Promise<EvidencePacket> {
  const ctx = await getActionContext();
  const limit = query.limit ?? 10_000;

  const [rawRows, chainHead, chainVerification] = await Promise.all([
    queryAuditLog({ ...query, limit }),
    getChainHead(ctx.organizationId),
    verifyAuditChain({ organizationId: ctx.organizationId, limit: 50_000 }),
  ]);

  const header: EvidencePacketHeader = {
    packetType: EVIDENCE_PACKET_VERSION,
    generatedAt: new Date().toISOString(),
    generatedBy: {
      organizationId: ctx.organizationId,
      actorId: ctx.userId ?? null,
      actorName: ctx.user?.name ?? null,
    },
    app: {
      version: appVersion,
      exporter: "audit-evidence@1",
    },
    query: {
      scope: query.scope,
      from: query.from.toISOString(),
      to: query.to.toISOString(),
      actorType: query.actorType ?? null,
      limit,
    },
    chainHead: {
      rowHash: chainHead.rowHash,
      createdAt: chainHead.createdAt ? chainHead.createdAt.toISOString() : null,
      rowCount: chainHead.rowCount,
    },
    chainVerification,
    rowCount: rawRows.length,
  };

  const body = { rows: rawRows.map(rowToEvidence) };
  const receiptInput = `${canonical(header)}\n${canonical(body)}`;
  const receipt = {
    algorithm: "sha256" as const,
    hash: sha256Hex(receiptInput),
  };

  return { header, body, receipt };
}

/**
 * Recompute the receipt from a parsed packet. Returns `{ ok: true }` when
 * the receipt matches the supplied header+body. External tooling can call
 * this to confirm the packet hasn't been edited after export.
 */
export function verifyEvidencePacket(packet: EvidencePacket): {
  ok: boolean;
  expected: string;
  actual: string;
} {
  const input = `${canonical(packet.header)}\n${canonical(packet.body)}`;
  const expected = sha256Hex(input);
  return {
    ok: expected === packet.receipt.hash,
    expected,
    actual: packet.receipt.hash,
  };
}
