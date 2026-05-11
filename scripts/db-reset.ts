/**
 * Operational Data Reset
 *
 * Truncates operational data tables while preserving infrastructure
 * (Better Auth, automations, agents, integrations).
 *
 * Usage: pnpm db:reset [--confirm]
 */

import "dotenv/config";
import { createInterface } from "readline";
import pg from "pg";

const OPERATIONAL_TABLES: string[] = [
  // Filled in as SDLC entities land in src/db/schema/.
  // Order: dependents first.
  "dilliznt.documents",
  "dilliznt.automation_logs",
];

async function confirmPrompt(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      "This will delete ALL operational data. Continue? [y/N] ",
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      },
    );
  });
}

async function main() {
  const skipConfirm = process.argv.includes("--confirm");

  if (!skipConfirm) {
    const ok = await confirmPrompt();
    if (!ok) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  if (OPERATIONAL_TABLES.length === 0) {
    console.log("No operational tables registered yet.");
    return;
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const tableList = OPERATIONAL_TABLES.join(", ");
    await client.query(`TRUNCATE ${tableList} CASCADE`);
    console.log(
      `Truncated ${OPERATIONAL_TABLES.length} operational tables. Infrastructure preserved.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
