"use server";

import { queryAuditLog, rowsToCsv, type AuditQuery } from "@/operations/audit/audit";
import { verifyAuditChain, type ChainVerification } from "@/operations/audit/audit-chain";
import { buildEvidencePacket, type EvidencePacket } from "@/operations/audit/audit-evidence";

const APP_VERSION = process.env.COZNT_APP_VERSION ?? "0.1.0-dev";

export async function exportAuditCsv(query: AuditQuery): Promise<string> {
  const rows = await queryAuditLog({ ...query, limit: 10_000 });
  return rowsToCsv(rows);
}

export async function verifyAuditChainAction(): Promise<ChainVerification> {
  return verifyAuditChain();
}

export async function buildEvidencePacketAction(query: AuditQuery): Promise<EvidencePacket> {
  return buildEvidencePacket(query, APP_VERSION);
}
