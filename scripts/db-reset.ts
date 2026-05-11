/**
 * Recruit Data Reset
 *
 * Truncates operational data tables while preserving
 * infrastructure (app registration, automations, agents).
 *
 * Usage: pnpm db:reset [--confirm]
 */

import "dotenv/config";
import { createInterface } from "readline";
import pg from "pg";

const OPERATIONAL_TABLES = [
  // Recruit entity data (order: dependents first)
  "dilliznt.interview_panelists",
  "dilliznt.interview_scorecards",
  "dilliznt.offer_checklist_items",
  "dilliznt.interviews",
  "dilliznt.interview_stages",
  "dilliznt.offers",
  "dilliznt.assessment_attempts",
  "dilliznt.assessment_questions",
  "dilliznt.assessments",
  "dilliznt.pool_members",
  "dilliznt.pools",
  "dilliznt.applications",
  "dilliznt.engagements",
  "dilliznt.triage_items",
  "dilliznt.matches",
  "dilliznt.documents",
  "dilliznt.org_candidates",
  "dilliznt.roles",
  "dilliznt.candidates",
  // Intelligence tables
  "dilliznt.candidate_intelligence",
  "dilliznt.application_intelligence",
  "dilliznt.interview_intelligence",
  "dilliznt.offer_intelligence",
  "dilliznt.engagement_intelligence",
  "dilliznt.assessment_intelligence",
  // Execution logs
  "dilliznt.automation_logs",
];

async function confirmPrompt(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      "This will delete ALL operational data (candidates, roles, interviews, etc.). Continue? [y/N] ",
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      }
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

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const tableList = OPERATIONAL_TABLES.join(", ");
    await client.query(`TRUNCATE ${tableList} CASCADE`);
    console.log(
      `Truncated ${OPERATIONAL_TABLES.length} operational tables. Infrastructure preserved.`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
