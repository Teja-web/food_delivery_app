#!/usr/bin/env tsx
/**
 * Headless preset: bootstrap a demo org with seeded sample workspace.
 *
 * Single shared path: delegates to `scripts/lib/bootstrap-org.ts`, which
 * also powers the interactive `pnpm db:onboard` CLI. Demo data ALWAYS
 * comes from `seedSampleWorkspace` — no fixture rows are inserted here.
 */
import "dotenv/config";
import { bootstrapOrg } from "./lib/bootstrap-org";

const ORG_NAME = "Acme Corporation";
const ORG_SLUG = "acme";
const OWNER_NAME = "Demo User";
const OWNER_EMAIL = "demo@coznt.local";
const OWNER_PASSWORD = "demo123!";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL must be set");
    process.exit(1);
  }
  const result = await bootstrapOrg({
    databaseUrl: process.env.DATABASE_URL,
    orgName: ORG_NAME,
    orgSlug: ORG_SLUG,
    ownerName: OWNER_NAME,
    ownerEmail: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    seedSample: true,
  });
  console.log(
    JSON.stringify(
      {
        orgId: result.orgId,
        userId: result.ownerUserId,
        email: OWNER_EMAIL,
        ...result.seed,
      },
      null,
      2,
    ),
  );
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
