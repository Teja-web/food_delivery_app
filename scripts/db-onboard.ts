#!/usr/bin/env tsx
/**
 * Coznt Onboarding Script — interactive CLI.
 *
 * Asks for organization + owner details, then delegates to the shared
 * `bootstrapOrg()` helper in `scripts/lib/bootstrap-org.ts` so this CLI
 * and `walkthrough-seed.ts` share a single audited code path. Demo data
 * always comes from `seedSampleWorkspace` — never inserted ad-hoc here.
 *
 * Usage:
 *   pnpm db:onboard                 # interactive (asks about sample data)
 *   pnpm db:onboard --sample        # non-interactive, seed sample data
 *   pnpm db:onboard --no-sample     # non-interactive, skip sample seed
 */

import "dotenv/config";
import { Pool } from "pg";
import { createInterface } from "readline/promises";

import { bootstrapOrg, slugify } from "./lib/bootstrap-org";

const argv = new Set(process.argv.slice(2));
const SAMPLE_FLAG: "yes" | "no" | "ask" = argv.has("--sample")
  ? "yes"
  : argv.has("--no-sample")
    ? "no"
    : "ask";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = (await rl.question(`  ${question}${suffix}: `)).trim();
  return answer || defaultValue || "";
}

async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await rl.question(`  ${question} [${hint}]: `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

async function main() {
  console.log("");
  console.log("=========================================");
  console.log("    COZNT ONBOARDING");
  console.log("=========================================");
  console.log("");

  console.log("Organization:");
  const orgName = await ask("Name", "Acme Corporation");
  const orgSlug = await ask("Slug", slugify(orgName));

  const existingOrg = await pool.query("SELECT id FROM auth.organization WHERE slug = $1", [orgSlug]);
  if (existingOrg.rows.length > 0) {
    console.log(`\n  Organization "${orgSlug}" already exists. Pick a different slug or reset first.\n`);
    rl.close();
    await pool.end();
    process.exit(1);
  }
  await pool.end();

  console.log("\nOwner Account:");
  const ownerName = await ask("Full name");
  const ownerEmail = await ask("Email");
  const password = await ask("Password", "demo123!");

  if (!ownerName || !ownerEmail) {
    console.log("\n  Owner name and email are required.\n");
    rl.close();
    process.exit(1);
  }

  let seedSample: boolean;
  if (SAMPLE_FLAG === "yes") seedSample = true;
  else if (SAMPLE_FLAG === "no") seedSample = false;
  else {
    console.log("\nSample workspace:");
    console.log("  Populates the org with 4 projects, 12 plans, 5 skills (with autonomy");
    console.log("  history), 8 rules, gates, approvals, deployments, work items, and");
    console.log("  notifications. Every UI surface lights up on first sign-in.");
    seedSample = await confirm("Seed sample workspace?", true);
  }

  console.log("\n-----------------------------------------");
  console.log(`  Organization:  ${orgName} (${orgSlug})`);
  console.log(`  Owner:         ${ownerName} <${ownerEmail}>`);
  console.log(`  Sample data:   ${seedSample ? "yes" : "no"}`);
  console.log("-----------------------------------------");

  const proceed = await confirm("Proceed?", true);
  if (!proceed) {
    console.log("\nAborted.\n");
    rl.close();
    process.exit(0);
  }
  rl.close();

  console.log("\nCreating organization & owner...");
  const result = await bootstrapOrg({
    databaseUrl: DATABASE_URL!,
    orgName,
    orgSlug,
    ownerName,
    ownerEmail,
    password,
    seedSample,
  });
  console.log(`  ${orgName} (${orgSlug})`);
  console.log(`  ${ownerName} <${ownerEmail}> (owner)`);
  console.log("  Default department");

  if (result.seed) {
    if (result.seed.inserted) {
      const c = result.seed.counts;
      console.log("\nSeeded sample workspace:");
      console.log(`  ${c.projects} projects · ${c.plans} plans · ${c.skills} skills (${c.autonomyRows} autonomy rows, ${c.skillOutcomes} outcomes)`);
      console.log(`  ${c.rules} rules · ${c.gates} gates · ${c.approvals} approvals · ${c.bindings} adapter bindings`);
      console.log(`  ${c.deployments} deployments · ${c.metrics} metric rows · ${c.auditLogs} audit entries`);
      console.log(`  ${c.workItems} work items · ${c.notifications} notifications`);
    } else {
      console.log("\n  Sample seed skipped — org already has projects.");
    }
  }

  console.log("\n=========================================");
  console.log("       ONBOARDING COMPLETE");
  console.log("=========================================");
  console.log(`\n  Login: ${ownerEmail} / ${password}`);
  console.log("\n  Run 'pnpm dev' to start the app\n");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error("\nOnboarding failed:", error?.message ?? error);
  rl.close();
  process.exit(1);
});
