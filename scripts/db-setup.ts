#!/usr/bin/env npx tsx
/**
 * Dilliznt Database Setup — fully self-contained.
 * Creates database, extensions, schemas, applies schema, triggers, seeds admin.
 *
 * Usage:
 *   pnpm db:setup          # Run migrations (incremental updates)
 *   pnpm db:setup --reset  # Drop, recreate, and push schema (fresh start)
 */

import "dotenv/config";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

const APP_DIR = import.meta.dirname ? join(import.meta.dirname, "..") : process.cwd();

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://postgres:password@localhost:5432/dilliznt";
process.env.DATABASE_URL = DATABASE_URL;
const url = new URL(DATABASE_URL);
const dbName = url.pathname.slice(1);

const ADMIN_CONFIG = {
  email: process.env.SEED_ADMIN_EMAIL || "admin@dilliznt.app",
  password: process.env.SEED_ADMIN_PASSWORD || "admin123",
  name: process.env.SEED_ADMIN_NAME || "Platform Admin",
};

function getAdminUrl(): string {
  const adminUrl = new URL(DATABASE_URL);
  adminUrl.pathname = "/postgres";
  return adminUrl.toString();
}

async function checkDatabaseExists(): Promise<boolean> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: getAdminUrl() });
  try {
    const result = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName],
    );
    return result.rows.length > 0;
  } finally {
    await pool.end();
  }
}

async function createDatabase(): Promise<void> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: getAdminUrl() });
  try {
    await pool.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await pool.end();
  }
}

async function dropDatabase(): Promise<void> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: getAdminUrl() });
  try {
    await pool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [dbName]);
    await pool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  } finally {
    await pool.end();
  }
}

async function initExtensionsAndSchemas() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log("\n-> Initializing extensions and schemas...");

    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgmq;`);
    console.log("  + pgmq extension");
    if (dbName === "dilliznt") {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_cron;`);
      console.log("  + pg_cron extension");
    } else {
      console.log("  - pg_cron skipped (only available in dilliznt database)");
    }
    await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log("  + vector extension");
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    console.log("  + uuid-ossp extension");

    for (const schema of ["auth", "dilliznt"]) {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema};`);
      console.log(`  + ${schema} schema`);
    }

    // Immutable wrappers for FTS index expressions (concat_ws and to_tsvector are STABLE, not IMMUTABLE)
    await pool.query(`
      CREATE OR REPLACE FUNCTION dilliznt.immutable_concat_ws(text, VARIADIC text[])
      RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
      $$SELECT array_to_string($2, $1)$$;
    `);
    await pool.query(`
      CREATE OR REPLACE FUNCTION dilliznt.fts_vector(VARIADIC text[])
      RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
      $$SELECT to_tsvector('english'::regconfig, array_to_string($1, ' '))$$;
    `);
    console.log("  + immutable FTS helpers");

    console.log("+ Extensions and schemas initialized");
  } finally {
    await pool.end();
  }
}

async function applyTriggers() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log("\n-> Applying CRUD triggers...");
    const sql = readFileSync(join(APP_DIR, "scripts", "crud-triggers.sql"), "utf-8");
    await pool.query(sql);
    console.log("+ CRUD triggers applied");
  } finally {
    await pool.end();
  }
}

async function seedPlatformAdmin(): Promise<void> {
  const { Pool } = await import("pg");
  const { hashPassword } = await import("better-auth/crypto");
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const existing = await pool.query(
      `SELECT id FROM auth."user" WHERE email = $1`,
      [ADMIN_CONFIG.email],
    );
    if (existing.rows.length > 0) {
      console.log(`  + Platform admin exists (${ADMIN_CONFIG.email})`);
      return;
    }

    const userId = `admin_${randomBytes(8).toString("hex")}`;
    const accountId = `acc_${randomBytes(8).toString("hex")}`;
    const orgId = `org_${randomBytes(8).toString("hex")}`;
    const memberId = `mem_${randomBytes(8).toString("hex")}`;
    const hashedPassword = await hashPassword(ADMIN_CONFIG.password);

    await pool.query(`
      INSERT INTO auth.organization (id, name, slug, created_at, updated_at)
      VALUES ($1, 'Default Organization', 'default', NOW(), NOW())
      ON CONFLICT (slug) DO NOTHING
    `, [orgId]);

    const orgResult = await pool.query(
      `SELECT id FROM auth.organization WHERE slug = 'default'`,
    );
    const finalOrgId = orgResult.rows[0]?.id || orgId;

    await pool.query(`
      INSERT INTO auth."user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, true, 'admin', NOW(), NOW())
    `, [userId, ADMIN_CONFIG.name, ADMIN_CONFIG.email]);

    await pool.query(`
      INSERT INTO auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES ($1, $2, 'credential', $3, $4, NOW(), NOW())
    `, [accountId, userId, userId, hashedPassword]);

    await pool.query(`
      INSERT INTO auth.member (id, organization_id, user_id, role, created_at)
      VALUES ($1, $2, $3, 'owner', NOW())
    `, [memberId, finalOrgId, userId]);

    console.log(`  + Platform admin created`);
    console.log(`    Email:    ${ADMIN_CONFIG.email}`);
    console.log(`    Password: ${ADMIN_CONFIG.password}`);
    console.log(`    Org:      Default Organization (${finalOrgId})`);
  } finally {
    await pool.end();
  }
}

async function markMigrationsApplied() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log("-> Marking migrations as applied...");

    // Create drizzle schema and migrations table (same structure drizzle-kit uses)
    await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle;`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      );
    `);

    // Read journal to get all migrations
    const journalPath = join(APP_DIR, "drizzle", "meta", "_journal.json");
    if (!existsSync(journalPath)) {
      console.log("  - No migrations journal found, skipping");
      return;
    }

    const journal = JSON.parse(readFileSync(journalPath, "utf-8"));

    for (const entry of journal.entries) {
      // Check if already marked
      const existing = await pool.query(
        `SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1`,
        [entry.tag]
      );

      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
          [entry.tag, entry.when]
        );
        console.log(`  + Marked: ${entry.tag}`);
      }
    }

    console.log("+ Migrations marked as applied");
  } finally {
    await pool.end();
  }
}

async function setupCronJobs() {
  if (dbName !== "dilliznt") {
    console.log("-> Skipping pg_cron jobs (only available in dilliznt database)");
    return;
  }

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log("-> Scheduling pg_cron jobs...");

    // No scheduled jobs registered yet. Add SDLC-specific cron jobs here
    // (e.g. nightly metrics rollup, stale-plan reminders) as features land.
    console.log("  (no scheduled jobs configured)");
  } finally {
    await pool.end();
  }
}

async function main() {
  const reset = process.argv.includes("--reset");

  console.log("===========================================");
  console.log("       DILLIZNT DATABASE SETUP");
  if (reset) console.log("           RESET MODE");
  console.log("===========================================");
  console.log(`Database: ${dbName}`);
  console.log(`Host: ${url.host}`);

  // Step 1: Create/reset database
  console.log("\n[1/6] Database...");
  const exists = await checkDatabaseExists();
  if (exists) {
    if (reset) {
      console.log(`-> Dropping database ${dbName}...`);
      await dropDatabase();
      console.log(`-> Creating database ${dbName}...`);
      await createDatabase();
      console.log(`+ Database recreated`);
    } else {
      console.log(`+ Database exists`);
    }
  } else {
    console.log(`-> Creating database ${dbName}...`);
    await createDatabase();
    console.log(`+ Database created`);
  }

  // Step 2: Extensions & schemas
  console.log("\n[2/6] Extensions & schemas...");
  await initExtensionsAndSchemas();

  // Step 3: Apply schema (push on reset, migrate otherwise)
  console.log("\n[3/6] Apply schema...");
  try {
    if (reset) {
      execSync("npx drizzle-kit push", { stdio: "inherit", cwd: APP_DIR, env: process.env });
      console.log("+ Schema pushed");
      // Mark existing migrations as applied so future migrate calls work
      await markMigrationsApplied();
    } else {
      execSync("npx drizzle-kit migrate", { stdio: "inherit", cwd: APP_DIR, env: process.env });
      console.log("+ Migrations applied");
    }
  } catch {
    console.error(reset ? "x Schema push failed" : "x Migration failed");
    throw new Error(reset ? "Schema push failed" : "Migration failed");
  }

  // Step 4: Platform admin
  console.log("\n[4/6] Platform admin...");
  await seedPlatformAdmin();

  // Step 5: CRUD triggers
  console.log("\n[5/6] CRUD triggers...");
  await applyTriggers();

  // Step 6: pg_cron scheduled jobs
  console.log("\n[6/6] Scheduled jobs...");
  await setupCronJobs();

  console.log("\n===========================================");
  console.log("           SETUP COMPLETE");
  console.log("===========================================");
  console.log("\nPlatform Admin:");
  console.log(`  Email:    ${ADMIN_CONFIG.email}`);
  console.log(`  Password: ${ADMIN_CONFIG.password}`);
  console.log("\nNext steps:");
  console.log("  pnpm db:seed     # Seed demo data");
  console.log("  pnpm db:onboard  # Create org + demo data");
  console.log("  pnpm dev         # Start the app\n");
}

main().catch((error) => {
  console.error("\nSetup failed:", error.message);
  process.exit(1);
});
