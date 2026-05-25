/**
 * `coznt sync` — align `<repo>/.coznt/skills/` with the server's
 * current choreography bundle for the bound project.
 *
 * Flow:
 *   1. Read `.coznt/config.json`
 *   2. Fetch manifest from `/api/v1/mcp/choreographies`
 *   3. Classify each entry (new / unchanged / remote-only / drift / conflict)
 *   4. For non-unchanged entries:
 *        - prompt the user on conflicts (overwrite / keep / diff)
 *        - fetch the bundle for entries that need updating
 *        - verify each entry's hash against the manifest before writing
 *   5. Write SKILL.md + .lock per fetched entry
 *
 * Flags:
 *   --force    skip drift prompts (always overwrite)
 *   --dry-run  print planned actions, write nothing
 */

import { readConfig } from "../lib/config.js";
import { fetchManifest, fetchBundle } from "../lib/api.js";
import { sha256 } from "../lib/hashing.js";
import {
  writeLock,
  writeLocalSkill,
  readLocalSkill,
} from "../lib/lock-file.js";
import { classify, summarize, type Classification } from "../lib/diff.js";
import { askChoice } from "../lib/prompt.js";
import { fetchCurrentHookVersion } from "../lib/prompt-hook-installer.js";

export interface SyncOptions {
  force?: boolean;
  dryRun?: boolean;
}

export async function runSync(options: SyncOptions = {}): Promise<number> {
  const cfg = readConfig();
  console.log(`coznt sync — project ${cfg.projectId} @ ${cfg.serverUrl}`);

  // Prompt-hook version drift — warn but never fail the sync.
  if (cfg.promptHook?.installed && cfg.promptHook.version) {
    const current = await fetchCurrentHookVersion(cfg.serverUrl);
    if (current && current !== cfg.promptHook.version) {
      console.warn(
        `[warn] prompt-hook drift detected: installed=${cfg.promptHook.version}, deployment=${current}. ` +
          `Run \`coznt connect --install-prompt-hook\` to refresh.`,
      );
    }
  }

  const manifest = await fetchManifest(cfg);
  console.log(
    `Manifest: ${manifest.choreographies.length} choreographies, manifestHash=${manifest.manifestHash.slice(0, 12)}…`,
  );

  const classes = classify(process.cwd(), manifest.choreographies);
  const summary = summarize(classes);
  console.log(
    `Comparing locks: ${summary.new} new, ${summary.unchanged} unchanged, ${summary.remoteOnly} updated remote, ${summary.localEditNoRemote} local-only edits, ${summary.conflict} conflicts`,
  );

  if (summary.unchanged === classes.length) {
    console.log("Nothing to do — every choreography is in sync.");
    return 0;
  }

  // Resolve conflicts and locally-edited-no-remote-change entries
  const slugsToFetch: string[] = [];
  const skipped: string[] = [];

  for (const cls of classes) {
    if (cls.kind === "unchanged") continue;
    if (cls.kind === "new" || cls.kind === "remote-only") {
      slugsToFetch.push(cls.slug);
      continue;
    }
    if (cls.kind === "locally-edited-no-remote-change") {
      // Server hasn't changed; respect the local edit.
      console.warn(
        `  [skip] ${cls.slug}: local edits present, remote unchanged. Leaving as-is.`,
      );
      skipped.push(cls.slug);
      continue;
    }
    // conflict
    if (options.force) {
      console.warn(`  [force] ${cls.slug}: overwriting local edits.`);
      slugsToFetch.push(cls.slug);
      continue;
    }
    if (options.dryRun) {
      console.log(`  [dry-run] ${cls.slug}: would prompt about conflict.`);
      continue;
    }
    const choice = await askChoice(
      `${cls.slug}: local edits AND remote changes both diverge from lock. (overwrite / keep / diff)?`,
      ["overwrite", "keep", "diff"],
    );
    if (choice === "diff") {
      printConflictDiff(cls);
      // Re-prompt after showing diff
      const second = await askChoice(
        `${cls.slug}: overwrite or keep?`,
        ["overwrite", "keep"],
      );
      if (second === "overwrite") slugsToFetch.push(cls.slug);
      else skipped.push(cls.slug);
    } else if (choice === "overwrite") {
      slugsToFetch.push(cls.slug);
    } else {
      skipped.push(cls.slug);
    }
  }

  if (options.dryRun) {
    console.log(
      `[dry-run] Would fetch: ${slugsToFetch.join(", ") || "(none)"}`,
    );
    console.log(`[dry-run] Would skip:  ${skipped.join(", ") || "(none)"}`);
    return 0;
  }

  if (slugsToFetch.length === 0) {
    console.log("No fetches needed.");
    return 0;
  }

  const bundle = await fetchBundle(cfg, slugsToFetch);
  console.log(`Fetched ${bundle.choreographies.length} entries; verifying hashes…`);

  // Verify hashes before writing
  for (const entry of bundle.choreographies) {
    const computed = sha256(entry.content);
    if (computed !== entry.hash) {
      console.error(
        `Hash mismatch on ${entry.slug}: computed ${computed} != manifest ${entry.hash}. Aborting; no files written.`,
      );
      return 1;
    }
  }

  // All verified — write files + locks
  const repoRoot = process.cwd();
  const now = new Date().toISOString();
  for (const entry of bundle.choreographies) {
    writeLocalSkill(repoRoot, entry.slug, entry.content, "platform");
    writeLock(
      repoRoot,
      entry.slug,
      { hash: entry.hash, version: entry.version, syncedAt: now },
      "platform",
    );
    console.log(`  [write] .coznt/skills/${entry.slug}/SKILL.md (v${entry.version})`);
  }

  // Customer-authored choreographies — write to .coznt/skills/custom/<slug>/.
  // For v1 we always sync these (no drift detection); the customer-authored
  // body changes with every UI edit, and the server is the source of truth.
  let customWritten = 0;
  if (bundle.custom && bundle.custom.length > 0) {
    for (const entry of bundle.custom) {
      const computed = sha256(entry.content);
      if (computed !== entry.hash) {
        console.error(
          `Hash mismatch on custom/${entry.slug}: ${computed} != ${entry.hash}. Aborting; some custom entries unwritten.`,
        );
        return 1;
      }
      writeLocalSkill(repoRoot, entry.slug, entry.content, "custom");
      writeLock(
        repoRoot,
        entry.slug,
        { hash: entry.hash, version: entry.version, syncedAt: now },
        "custom",
      );
      console.log(
        `  [write] .coznt/skills/custom/${entry.slug}/SKILL.md (v${entry.version}, scope=${entry.scope})`,
      );
      customWritten++;
    }
  }

  console.log(
    `\nSync complete: ${bundle.choreographies.length} platform, ${customWritten} custom written, ${skipped.length} skipped, ${summary.unchanged} already current.`,
  );
  return 0;
}

function printConflictDiff(cls: Classification): void {
  if (cls.kind !== "conflict") return;
  const repoRoot = process.cwd();
  const local = readLocalSkill(repoRoot, cls.slug) ?? "(missing)";
  console.log(`\n--- ${cls.slug}: local edits (sha=${cls.localHash.slice(0, 8)}…) ---`);
  console.log(local.split("\n").slice(0, 30).join("\n"));
  console.log("--- (showing first 30 lines; use git diff for full) ---\n");
}
