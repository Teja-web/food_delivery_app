/**
 * Coznt Seed — standalone, no core imports.
 *
 * CRUD triggers are already applied by db-setup.ts.
 * Agents are plain objects in code — no DB seeding needed.
 * This script seeds any reference data that's needed.
 *
 * Order: db:setup → db:seed → db:onboard
 */

import "dotenv/config";
import { Pool } from "pg";

async function seed(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log("[coznt:seed] Running seed...");

    // Verify CRUD triggers are applied
    const triggerCheck = await pool.query(`
      SELECT trigger_name FROM information_schema.triggers
      WHERE trigger_schema = 'coznt'
      LIMIT 5
    `);
    console.log(`  ${triggerCheck.rows.length} CRUD triggers found`);

    // Verify pgmq queue exists
    try {
      const queueCheck = await pool.query(`
        SELECT * FROM pgmq.metrics('coznt_events')
      `);
      console.log(`  coznt_events queue: ${queueCheck.rows[0]?.queue_length ?? 0} messages`);
    } catch {
      console.log("  coznt_events queue not found — run db:setup first");
    }

    console.log("Seed complete!");
  } catch (error) {
    console.error("Seed failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

seed(databaseUrl).then(() => process.exit(0)).catch(() => process.exit(1));
