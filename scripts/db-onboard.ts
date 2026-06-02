#!/usr/bin/env tsx
/**
 * Coznt Onboarding Script — interactive CLI.
 *
 * Asks for organization + owner details, then delegates to the shared
 * `bootstrapOrg()` helper in `scripts/lib/bootstrap-org.ts`.
 *
 * Usage:
 *   pnpm db:onboard
 */

import "dotenv/config";
import { Pool } from "pg";
import { createInterface } from "readline/promises";

import { bootstrapOrg, slugify } from "./lib/bootstrap-org";

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

  console.log("\n-----------------------------------------");
  console.log(`  Organization:  ${orgName} (${orgSlug})`);
  console.log(`  Owner:         ${ownerName} <${ownerEmail}>`);
  console.log("-----------------------------------------");

  const proceed = await confirm("Proceed?", true);
  if (!proceed) {
    console.log("\nAborted.\n");
    rl.close();
    process.exit(0);
  }
  rl.close();

  console.log("\nCreating organization & owner...");
  await bootstrapOrg({
    databaseUrl: DATABASE_URL!,
    orgName,
    orgSlug,
    ownerName,
    ownerEmail,
    password,
  });
  console.log(`  ${orgName} (${orgSlug})`);
  console.log(`  ${ownerName} <${ownerEmail}> (owner)`);
  console.log("  Default department");

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
