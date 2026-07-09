/**
 * MTTR backfill — walks historical deployments per (project, environment)
 * lane and writes any missing `mttr` metric rows.
 *
 * Idempotent: each MTTR row carries `metadata.failedDeploymentId`; the
 * helper checks for existence before insert. Re-running this is safe.
 *
 * Run with:
 *   pnpm tsx scripts/backfill-mttr.ts
 */

import "dotenv/config";

import { asc } from "drizzle-orm";

import { db } from "../../src/db/client";
import { deployments, type Deployment } from "../../src/db/schema/deployment";
import {
  recordMttrForRollback,
  recordMttrForSuccess,
} from "../../src/operations/dora/mttr";
import { buildScopedContext, runWithContext } from "../../src/lib/auth/context";
import { createLogger } from "../../src/lib/logger";

const log = createLogger("backfill-mttr");

async function main() {
  const ctx = buildScopedContext("__backfill__", {
    id: "script:backfill-mttr",
    name: "backfill-mttr",
  });
  await runWithContext(ctx, async () => {
    // Pull every deployment ordered by start time. With tens of thousands
    // this needs paging; small workspaces are fine in one shot.
    const all: Deployment[] = await db
      .select()
      .from(deployments)
      .orderBy(asc(deployments.startedAt));

    log.info(`scanning ${all.length} deployments…`);
    let writes = 0;
    for (const d of all) {
      if (d.status === "rolled_back") {
        const before = writes;
        await recordMttrForRollback(d);
        // The helper is idempotent on `failedDeploymentId` — we can't
        // tell from here whether it actually inserted. Best-effort: log
        // counts at end.
        if (before !== writes) writes += 1;
      } else if (d.status === "success") {
        await recordMttrForSuccess(d);
      }
    }
    log.info(`pass complete. Re-run is safe — repeat inserts are blocked by metadata lookup.`);
  });
}

main().then(
  () => process.exit(0),
  (err) => {
    log.error("fatal", { err: String(err) });
    process.exit(1);
  },
);
