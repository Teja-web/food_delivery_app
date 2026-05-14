"use server";

import { queryAuditLog, rowsToCsv, type AuditQuery } from "@/operations/audit";

export async function exportAuditCsv(query: AuditQuery): Promise<string> {
  const rows = await queryAuditLog({ ...query, limit: 10_000 });
  return rowsToCsv(rows);
}
