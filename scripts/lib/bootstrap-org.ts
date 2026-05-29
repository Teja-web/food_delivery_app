/**
 * Shared org + owner + sample-workspace bootstrap.
 *
 * Used by both onboarding entry points so there's a single, audited path
 * for "create org → create owner → optionally seed convincing demo data":
 *   - scripts/db-onboard.ts   (interactive CLI, with --sample flag)
 *   - scripts/walkthrough-seed.ts  (headless preset for the demo walkthrough)
 *
 * Demo data ALWAYS comes from `seedSampleWorkspace`. No script should
 * insert sample rows directly — extend `seed-sample-workspace.ts` instead.
 */

import { randomBytes } from "crypto";
import { Pool, type PoolClient } from "pg";
import { hashPassword } from "better-auth/crypto";

import { seedSampleWorkspace, type SeedResult } from "../../src/operations/seed-sample-workspace";
import { seedPlatformSkills } from "../seed-platform-skills";

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface BootstrapOrgArgs {
  databaseUrl: string;
  orgName: string;
  orgSlug: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
  /** Seed the sample workspace? Default: true. */
  seedSample?: boolean;
}

export interface BootstrapResult {
  orgId: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  /** Present only when seedSample !== false. */
  seed?: SeedResult;
}

async function insertOrganization(
  client: PoolClient,
  orgName: string,
  orgSlug: string,
): Promise<string> {
  const orgId = generateId("org");
  await client.query(
    `INSERT INTO auth.organization (id, name, slug, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())`,
    [orgId, orgName, orgSlug],
  );
  return orgId;
}

async function insertOwner(
  client: PoolClient,
  orgId: string,
  name: string,
  email: string,
  password: string,
): Promise<string> {
  const userId = generateId("user");
  const hashed = await hashPassword(password);

  await client.query(
    `INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, NOW(), NOW())`,
    [userId, name, email],
  );
  await client.query(
    `INSERT INTO auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     VALUES ($1, $2, 'credential', $3, $4, NOW(), NOW())`,
    [generateId("acc"), userId, userId, hashed],
  );
  await client.query(
    `INSERT INTO auth.member (id, organization_id, user_id, role, created_at)
     VALUES ($1, $2, $3, 'owner', NOW())`,
    [generateId("mem"), orgId, userId],
  );
  return userId;
}

async function insertDefaultDepartment(client: PoolClient, orgId: string): Promise<void> {
  await client.query(
    `INSERT INTO coznt.departments (id, organization_id, name, created_at, updated_at)
     VALUES ($1, $2, 'Default', NOW(), NOW())`,
    [generateId("dept"), orgId],
  );
}

export async function bootstrapOrg(args: BootstrapOrgArgs): Promise<BootstrapResult> {
  const pool = new Pool({ connectionString: args.databaseUrl });
  const client = await pool.connect();

  let orgId: string;
  let ownerUserId: string;
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA IF NOT EXISTS coznt");
    orgId = await insertOrganization(client, args.orgName, args.orgSlug);
    ownerUserId = await insertOwner(
      client,
      orgId,
      args.ownerName,
      args.ownerEmail,
      args.password,
    );
    await insertDefaultDepartment(client, orgId);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  // Every new org gets the 12 platform skills as org-wide rows (project_id
  // NULL). Multi-tenant visibility is org-scoped, so without this step new
  // orgs would see zero platform skills via `coznt sync` — see
  // `feature: platform-skills-org-propagation`.
  try {
    const { inserted, updated } = await seedPlatformSkills(orgId);
    console.log(
      `  + Platform skills seeded into ${orgId}: ${inserted} inserted, ${updated} updated`,
    );
  } catch (e) {
    console.warn(
      `  ! Platform-skill seeding failed for ${orgId}: ${(e as Error).message}. ` +
        `Run \`COZNT_SEED_ORG_ID=${orgId} pnpm tsx scripts/seed-platform-skills.ts\` to retry.`,
    );
  }

  const result: BootstrapResult = {
    orgId,
    ownerUserId,
    ownerName: args.ownerName,
    ownerEmail: args.ownerEmail,
  };

  if (args.seedSample !== false) {
    result.seed = await seedSampleWorkspace({
      organizationId: orgId,
      userId: ownerUserId,
      userName: args.ownerName,
    });
  }

  return result;
}
