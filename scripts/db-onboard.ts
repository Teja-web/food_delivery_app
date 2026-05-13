#!/usr/bin/env tsx
/**
 * Coznt Onboarding Script
 *
 * Creates organization + owner account, and optionally seeds a fully
 * cross-linked sample workspace (4 projects, 5 skills with 30-day autonomy
 * history, 12 plans, 8 rules, 15 phase gates, 12 approvals, deployments,
 * DORA metrics, audit log entries) so every UI surface looks alive on first
 * sign-in.
 *
 * Usage:
 *   pnpm db:onboard                 # interactive (asks about sample data)
 *   pnpm db:onboard --sample        # non-interactive, seed sample data
 *   pnpm db:onboard --no-sample     # non-interactive, skip sample seed
 */

import "dotenv/config";
import { Pool, type PoolClient } from "pg";
import { createInterface } from "readline/promises";
import { randomBytes } from "crypto";
import { hashPassword } from "better-auth/crypto";

import { seedSampleWorkspace } from "../src/operations/seed-sample-workspace";

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

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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

// ============================================
// Seed Functions
// ============================================

async function seedOrganization(client: PoolClient, orgName: string, orgSlug: string): Promise<string> {
  const orgId = generateId("org");
  await client.query(`
    INSERT INTO auth.organization (id, name, slug, created_at, updated_at)
    VALUES ($1, $2, $3, NOW(), NOW())
  `, [orgId, orgName, orgSlug]);
  console.log(`  ${orgName} (${orgSlug})`);
  return orgId;
}

async function seedOwner(client: PoolClient, orgId: string, name: string, email: string, password: string): Promise<{ userId: string; name: string; email: string }> {
  const userId = generateId("user");
  const hashedPassword = await hashPassword(password);

  await client.query(`
    INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, true, NOW(), NOW())
  `, [userId, name, email]);

  await client.query(`
    INSERT INTO auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    VALUES ($1, $2, 'credential', $3, $4, NOW(), NOW())
  `, [generateId("acc"), userId, userId, hashedPassword]);

  await client.query(`
    INSERT INTO auth.member (id, organization_id, user_id, role, created_at)
    VALUES ($1, $2, $3, 'owner', NOW())
  `, [generateId("mem"), orgId, userId]);

  console.log(`  ${name} <${email}> (owner)`);
  return { userId, name, email };
}

// ============================================
// Main
// ============================================

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

  console.log("\nOwner Account:");
  const ownerName = await ask("Full name");
  const ownerEmail = await ask("Email");
  const password = await ask("Password", "demo123!");

  if (!ownerName || !ownerEmail) {
    console.log("\n  Owner name and email are required.\n");
    rl.close();
    await pool.end();
    process.exit(1);
  }

  let seedSample: boolean;
  if (SAMPLE_FLAG === "yes") seedSample = true;
  else if (SAMPLE_FLAG === "no") seedSample = false;
  else {
    console.log("\nSample workspace:");
    console.log("  Populates the org with 4 projects, 12 plans, 5 skills (with autonomy");
    console.log("  history), 8 rules, gates, approvals, deployments, and DORA metrics.");
    console.log("  Every UI surface lights up on first sign-in.");
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
    await pool.end();
    process.exit(0);
  }
  rl.close();

  const client = await pool.connect();
  let owner: { userId: string; name: string; email: string } | undefined;
  let orgIdForSeed: string | undefined;

  try {
    await client.query("BEGIN");

    await client.query("CREATE SCHEMA IF NOT EXISTS coznt");

    console.log("\nCreating organization...");
    const orgId = await seedOrganization(client, orgName, orgSlug);
    orgIdForSeed = orgId;
    console.log("Creating owner...");
    owner = await seedOwner(client, orgId, ownerName, ownerEmail, password);

    console.log("Seeding default department...");
    await client.query(`
      INSERT INTO coznt.departments (id, organization_id, name, created_at, updated_at)
      VALUES ($1, $2, 'Default', NOW(), NOW())
    `, [generateId("dept"), orgId]);
    console.log("  Default");

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  if (seedSample && owner && orgIdForSeed) {
    console.log("\nSeeding sample workspace...");
    const result = await seedSampleWorkspace({
      organizationId: orgIdForSeed,
      userId: owner.userId,
      userName: owner.name,
    });
    if (result.inserted) {
      const c = result.counts;
      console.log(`  ${c.projects} projects · ${c.plans} plans · ${c.skills} skills (${c.autonomyRows} autonomy rows, ${c.skillOutcomes} outcomes)`);
      console.log(`  ${c.rules} rules · ${c.gates} gates · ${c.approvals} approvals · ${c.bindings} adapter bindings`);
      console.log(`  ${c.deployments} deployments · ${c.metrics} metric rows · ${c.auditLogs} audit entries`);
    } else {
      console.log("  Skipped — org already has projects.");
    }
  }

  console.log("\n=========================================");
  console.log("       ONBOARDING COMPLETE");
  console.log("=========================================");
  console.log(`\n  Login: ${ownerEmail} / ${password}`);
  console.log("\n  Run 'pnpm dev' to start the app\n");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error("\nOnboarding failed:", error.message);
  rl.close();
  process.exit(1);
});
