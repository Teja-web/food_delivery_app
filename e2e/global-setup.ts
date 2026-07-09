import { execSync } from "child_process";
import { join } from "path";

/**
 * Playwright globalSetup — runs db:reset before the full suite
 * so repeated runs don't accumulate stale operational data.
 */
export default function globalSetup() {
  console.log("\n[global-setup] Resetting operational data…");
  try {
    execSync("pnpm db:reset --confirm", {
      cwd: join(import.meta.dirname, ".."),
      stdio: "inherit",
    });
    console.log("[global-setup] Done.\n");
  } catch {
    console.warn("[global-setup] db:reset failed (missing tables?) — continuing anyway.\n");
  }
}
