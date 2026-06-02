/**
 * Milestone B — audit_logs hash-chain smoke harness.
 *
 * Validates the BEFORE INSERT trigger + the `verifyAuditChain` walker by:
 *   1. Inserting N audit_log rows in sequence
 *   2. Asserting verifyAuditChain returns ok
 *   3. Tampering with one row (UPDATE summary)
 *   4. Asserting verifyAuditChain reports drift at that row
 *   5. Cleaning up
 *
 * Run with:
 *   pnpm tsx scripts/smoke-audit-chain.ts
 *
 * Requires the trigger to be present (re-run `pnpm db:setup` if upgrading
 * from before Milestone B).
 */

import "dotenv/config";

import { and, eq, inArray, like } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "../../src/db/client";
import { auditLogs } from "../../src/db/schema/audit/audit-log";
import { verifyAuditChain } from "../../src/operations/audit/audit-chain";

const ORG = "__smoke_audit_chain__";
const ACTION_TAG = "smoke.audit_chain";

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}
function fail(label: string, err?: unknown): never {
  console.error(`  ✗ ${label}${err ? ` — ${String(err)}` : ""}`);
  process.exit(1);
}
function banner(label: string) {
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 64 - label.length))}`);
}

async function cleanup() {
  await db
    .delete(auditLogs)
    .where(and(eq(auditLogs.organizationId, ORG), eq(auditLogs.action, ACTION_TAG)));
}

async function main() {
  await cleanup();

  banner("Step 1 — insert 5 chained rows");
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const [row] = await db
      .insert(auditLogs)
      .values({
        id: nanoid(),
        organizationId: ORG,
        actorType: "system",
        actorName: "audit-chain-smoke",
        action: ACTION_TAG,
        entityType: "smoke_chain_target",
        entityId: `entity-${i}`,
        summary: `original summary ${i}`,
      })
      .returning();
    ids.push(row.id);
  }
  ok(`5 rows inserted: ${ids.map((id) => id.slice(0, 6)).join(", ")}`);

  banner("Step 2 — verify clean chain");
  let result = await verifyAuditChain({ organizationId: ORG });
  if (!result.ok) fail(`expected ok; got drift at ${result.drift.rowId}: ${result.drift.reason}`);
  ok(`chain verified — ${result.checked} rows checked`);

  banner("Step 3 — populated row_hash + prev_hash");
  const rows = await db.query.auditLogs.findMany({
    where: and(eq(auditLogs.organizationId, ORG), inArray(auditLogs.id, ids)),
  });
  for (const r of rows) {
    if (!r.rowHash) fail(`row ${r.id.slice(0, 8)} has null row_hash — trigger didn't fire`);
  }
  ok(`every row has row_hash populated (genesis prev_hash = ${rows[0].prevHash === null ? "null ✓" : "unexpected: " + rows[0].prevHash})`);

  banner("Step 4 — tamper with row #3's summary");
  await db
    .update(auditLogs)
    .set({ summary: "TAMPERED — should break chain" })
    .where(eq(auditLogs.id, ids[2]));
  ok("UPDATE applied (raw SQL would bypass any app-level invariants)");

  banner("Step 5 — verify detects drift");
  result = await verifyAuditChain({ organizationId: ORG });
  if (result.ok) fail("expected drift; verifyAuditChain reported ok");
  if (result.drift.rowId !== ids[2]) {
    fail(
      `drift reported at wrong row — expected ${ids[2].slice(0, 8)}, got ${result.drift.rowId.slice(0, 8)}`,
    );
  }
  if (result.drift.reason !== "row_hash mismatch") {
    fail(`unexpected reason: ${result.drift.reason}`);
  }
  ok(`drift detected at row ${result.drift.rowId.slice(0, 8)} (reason: ${result.drift.reason})`);
  ok(
    `expected sha256: ${result.drift.expectedRowHash.slice(0, 16)}…, actual: ${result.drift.actualRowHash?.slice(0, 16)}…`,
  );

  banner("Step 6 — cleanup");
  await cleanup();
  ok("smoke rows removed");

  console.log("\nAudit chain smoke passed.");
}

main().then(
  () => process.exit(0),
  async (err) => {
    console.error("\nSmoke failed:", err);
    await cleanup().catch(() => {});
    process.exit(1);
  },
);
