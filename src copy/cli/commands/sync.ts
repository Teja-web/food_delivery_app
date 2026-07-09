/**
 * `coznt sync` — the universal "pull what's drifted" command.
 *
 * Connect is one-time (API key, project pick, editor pick). Sync is
 * the frequent-update command — runnable anytime, idempotent, takes
 * no user input. Everything that the server is the source of truth for
 * gets refreshed here:
 *
 *   1. MCP tarball version (rewrites editor's .mcp.json if drifted).
 *   2. Posture files (CLAUDE.md / AGENTS.md / per-editor rules).
 *   3. Prompt-hook version metadata (URL uses /latest, so no settings
 *      rewrite is needed — just keep .coznt/config.json honest).
 *   4. Choreography content (manifest diff + bundle fetch + write).
 *
 * Anything that requires a human decision stays in `connect`.
 *
 * Flags:
 *   --force    skip drift prompts (always overwrite)
 *   --dry-run  print planned actions, write nothing
 */

import { readConfig, writeConfig } from "../lib/config";
import {
  fetchManifest,
  fetchBundle,
  fetchStandardsManifest,
  fetchStandardsBundle,
} from "../lib/api";
import { sha256 } from "../lib/hashing";
import {
  writeLock,
  writeLocalSkill,
  readLocalSkill,
} from "../lib/lock-file";
import { classify, summarize, type Classification } from "../lib/diff";
import {
  classifyStandards,
  standardEntryName,
  summarizeStandards,
  type StandardClassification,
} from "../lib/standard-diff";
import {
  readLocalStandard,
  writeLocalStandard,
  writeStandardLock,
} from "../lib/standard-lock-file";
import { askChoice } from "../lib/prompt";
import {
  fetchCurrentArtifactVersion,
  fetchCurrentHookVersion,
} from "../lib/prompt-hook-installer";
import { detectEditors, type EditorName } from "../lib/editor-detect";
import { writePostureFiles } from "../lib/posture-writer";
import { writeForEditor } from "../lib/mcp-config-writers/index";
import { tarballUrl } from "../../lib/agent-context/host-config";
import { resolveApiKey } from "../lib/auth";
import { getRunningCliVersion } from "../lib/cli-version";

export interface SyncOptions {
  force?: boolean;
  dryRun?: boolean;
}

export async function runSync(options: SyncOptions = {}): Promise<number> {
  const cfg = readConfig();
  const repoRoot = process.cwd();
  console.log(`coznt sync — project ${cfg.projectId} @ ${cfg.serverUrl}`);

  // 0. CLI self-check. The CLI is the one distribution channel sync
  // can't refresh on its own — if the running CLI is older than the
  // server's published version, every feature added since then is
  // silently absent. Nudge once, prominently, before doing any other
  // work; the user can keep going (drift is not fatal).
  const localCli = getRunningCliVersion();
  const serverCli = await fetchCurrentArtifactVersion(cfg.serverUrl, "coznt-cli");
  if (localCli && serverCli && localCli !== serverCli) {
    console.warn("");
    console.warn(
      `[warn] coznt CLI is stale: installed=${localCli}, server=${serverCli}.`,
    );
    console.warn(
      `       Run: pnpm install -g ${cfg.serverUrl}/install/coznt-cli-${serverCli}.tgz`,
    );
    console.warn(
      `       Then re-run \`coznt sync\` to pick up any new sync features in the newer CLI.`,
    );
    console.warn("");
  }

  // Best-effort editor detection. Used by posture-file writer and the
  // MCP-config refresh below; if undetected, those steps skip silently
  // rather than guessing wrong.
  const detected = detectEditors(repoRoot);
  const editor: EditorName | null = detected[0]?.name ?? null;

  let editorRestartNeeded = false;

  // 1. MCP tarball version refresh. The editor config pins a version in
  // the tarball URL; when the server's current version moves ahead, the
  // editor keeps spawning the pinned (older) MCP server even after every
  // other artifact is fresh. Rewrite the editor config so the next launch
  // fetches the new tarball.
  if (editor && cfg.mcp?.version) {
    const currentMcp = await fetchCurrentArtifactVersion(cfg.serverUrl, "coznt-mcp");
    if (currentMcp && currentMcp !== cfg.mcp.version) {
      if (options.dryRun) {
        console.log(
          `[dry-run] MCP tarball drift: installed=${cfg.mcp.version}, deployment=${currentMcp}. Would refresh .mcp.json.`,
        );
      } else {
        try {
          const apiKey = resolveApiKey(cfg.apiKeyRef);
          const apiKeyEnvValue =
            cfg.apiKeyRef.kind === "env"
              ? `\${${cfg.apiKeyRef.name}}`
              : apiKey;
          const cozntEntry = {
            command: "npx",
            args: ["-y", tarballUrl(cfg.serverUrl, currentMcp)],
            env: { COZNT_URL: cfg.serverUrl, COZNT_API_KEY: apiKeyEnvValue },
          };
          const wrote = writeForEditor(editor, { repoRoot, cozntEntry });
          console.log(
            `✓ Refreshed ${wrote.path} → MCP v${currentMcp} (was v${cfg.mcp.version})`,
          );
          writeConfig({ ...cfg, mcp: { version: currentMcp } }, repoRoot);
          editorRestartNeeded = true;
        } catch (e) {
          console.warn(
            `[warn] could not refresh MCP config: ${(e as Error).message}. Re-run \`coznt connect\` to recover.`,
          );
        }
      }
    }
  } else if (editor && !cfg.mcp?.version) {
    // First sync after a connect that pre-dated mcp.version tracking.
    // Backfill the recorded version so future drift detection works.
    const currentMcp = await fetchCurrentArtifactVersion(cfg.serverUrl, "coznt-mcp");
    if (currentMcp && !options.dryRun) {
      writeConfig({ ...cfg, mcp: { version: currentMcp } }, repoRoot);
    }
  }

  // 2. Posture files (CLAUDE.md / AGENTS.md / per-editor rules) —
  // idempotent managed-block writes. Cheap to call every sync.
  if (editor && !options.dryRun) {
    const postures = writePostureFiles(repoRoot, editor);
    for (const p of postures) {
      if (!p.changed) continue;
      const verb = p.replaced ? "Refreshed" : p.existed ? "Updated" : "Wrote";
      console.log(`✓ ${verb} ${p.path}`);
    }
  }

  // 3. Prompt-hook version metadata. The hook URL uses `/latest`, so the
  // hook script itself refreshes on every invocation via `npx -y`. The
  // only thing to keep honest is the version recorded in config.json so
  // future operators can audit what's in flight.
  if (cfg.promptHook?.installed && cfg.promptHook.version) {
    const current = await fetchCurrentHookVersion(cfg.serverUrl);
    if (current && current !== cfg.promptHook.version) {
      if (options.dryRun) {
        console.log(
          `[dry-run] prompt-hook version drift: ${cfg.promptHook.version} → ${current}. Would update config metadata.`,
        );
      } else {
        writeConfig(
          { ...cfg, promptHook: { ...cfg.promptHook, version: current } },
          repoRoot,
        );
        console.log(
          `✓ Prompt-hook version metadata refreshed: ${cfg.promptHook.version} → ${current}`,
        );
      }
    }
  }

  const [manifest, standardsManifest] = await Promise.all([
    fetchManifest(cfg),
    fetchStandardsManifest(cfg),
  ]);
  console.log(
    `Manifest: ${manifest.choreographies.length} choreographies, manifestHash=${manifest.manifestHash.slice(0, 12)}…`,
  );
  console.log(
    `Standards: ${standardsManifest.standards.length} effective, required=${standardsManifest.requiredComplete ? "complete" : "missing"}`,
  );
  if (!standardsManifest.requiredComplete && standardsManifest.missingRequired.length > 0) {
    console.warn(
      `[warn] Missing required org standards: ${standardsManifest.missingRequired.join(", ")}.`,
    );
  }

  const classes = classify(process.cwd(), manifest.choreographies);
  const summary = summarize(classes);
  console.log(
    `Comparing locks: ${summary.new} new, ${summary.unchanged} unchanged, ${summary.remoteOnly} updated remote, ${summary.localEditNoRemote} local-only edits, ${summary.conflict} conflicts`,
  );

  const standardClasses = classifyStandards(process.cwd(), standardsManifest.standards);
  const standardSummary = summarizeStandards(standardClasses);
  if (standardsManifest.standards.length > 0) {
    console.log(
      `Comparing standard locks: ${standardSummary.new} new, ${standardSummary.unchanged} unchanged, ${standardSummary.remoteOnly} updated remote, ${standardSummary.localEditNoRemote} local-only edits, ${standardSummary.conflict} conflicts`,
    );
  }

  if (
    summary.unchanged === classes.length &&
    standardSummary.unchanged === standardClasses.length
  ) {
    console.log("Nothing to do — every choreography and standard is in sync.");
    return 0;
  }

  // Resolve conflicts and locally-edited-no-remote-change entries
  const slugsToFetch: string[] = [];
  const skipped: string[] = [];
  const standardsToFetch: string[] = [];
  const standardsSkipped: string[] = [];

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

  for (const cls of standardClasses) {
    if (cls.kind === "unchanged") continue;
    if (cls.kind === "new" || cls.kind === "remote-only") {
      standardsToFetch.push(cls.name);
      continue;
    }
    if (cls.kind === "locally-edited-no-remote-change") {
      console.warn(
        `  [skip] artifact/${cls.name}: local edits present, remote unchanged. Leaving as-is.`,
      );
      standardsSkipped.push(cls.name);
      continue;
    }
    if (options.force) {
      console.warn(`  [force] artifact/${cls.name}: overwriting local edits.`);
      standardsToFetch.push(cls.name);
      continue;
    }
    if (options.dryRun) {
      console.log(`  [dry-run] artifact/${cls.name}: would prompt about conflict.`);
      continue;
    }
    const choice = await askChoice(
      `artifact/${cls.name}: local edits AND remote changes both diverge from lock. (overwrite / keep / diff)?`,
      ["overwrite", "keep", "diff"],
    );
    if (choice === "diff") {
      printStandardConflictDiff(cls);
      const second = await askChoice(
        `artifact/${cls.name}: overwrite or keep?`,
        ["overwrite", "keep"],
      );
      if (second === "overwrite") standardsToFetch.push(cls.name);
      else standardsSkipped.push(cls.name);
    } else if (choice === "overwrite") {
      standardsToFetch.push(cls.name);
    } else {
      standardsSkipped.push(cls.name);
    }
  }

  if (options.dryRun) {
    console.log(
      `[dry-run] Would fetch: ${slugsToFetch.join(", ") || "(none)"}`,
    );
    console.log(`[dry-run] Would skip:  ${skipped.join(", ") || "(none)"}`);
    console.log(
      `[dry-run] Would fetch standards: ${standardsToFetch.join(", ") || "(none)"}`,
    );
    console.log(`[dry-run] Would skip standards:  ${standardsSkipped.join(", ") || "(none)"}`);
    return 0;
  }

  if (slugsToFetch.length === 0 && standardsToFetch.length === 0) {
    console.log("No fetches needed.");
    return 0;
  }

  const [bundle, standardsBundle] = await Promise.all([
    slugsToFetch.length > 0
      ? fetchBundle(cfg, slugsToFetch)
      : Promise.resolve({ choreographies: [], custom: [], manifestHash: manifest.manifestHash }),
    standardsToFetch.length > 0
      ? fetchStandardsBundle(cfg, standardsToFetch)
      : Promise.resolve({
          standards: [],
          missingRequired: standardsManifest.missingRequired,
          requiredComplete: standardsManifest.requiredComplete,
          manifestHash: standardsManifest.manifestHash,
        }),
  ]);
  console.log(
    `Fetched ${bundle.choreographies.length} choreographies and ${standardsBundle.standards.length} standards; verifying hashes…`,
  );

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
  for (const entry of standardsBundle.standards) {
    const name = standardEntryName(entry);
    const computed = sha256(entry.content);
    if (computed !== entry.hash) {
      console.error(
        `Hash mismatch on artifact/${name}: computed ${computed} != manifest ${entry.hash}. Aborting; no files written.`,
      );
      return 1;
    }
  }

  // All verified — write files + locks. `repoRoot` already declared at
  // the top of runSync.
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

  for (const entry of standardsBundle.standards) {
    const name = standardEntryName(entry);
    writeLocalStandard(repoRoot, name, entry.content);
    writeStandardLock(repoRoot, name, {
      hash: entry.hash,
      version: entry.version,
      syncedAt: now,
      scope: entry.scope,
      kind: entry.kind,
      type: entry.type,
    });
    console.log(
      `  [write] .coznt/artifacts/${name} (v${entry.version}, scope=${entry.scope})`,
    );
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
    `\nSync complete: ${bundle.choreographies.length} platform, ${customWritten} custom written, ${standardsBundle.standards.length} standards written, ${skipped.length + standardsSkipped.length} skipped, ${summary.unchanged + standardSummary.unchanged} already current.`,
  );

  if (editorRestartNeeded) {
    console.log("");
    console.log(
      "Restart your editor so it spawns a fresh MCP server with the new tarball.",
    );
    console.log(
      "If it still serves stale tool descriptions, clear the npx cache: `rm -rf ~/.npm/_npx`.",
    );
  }

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

function printStandardConflictDiff(cls: StandardClassification): void {
  if (cls.kind !== "conflict") return;
  const repoRoot = process.cwd();
  const local = readLocalStandard(repoRoot, cls.name) ?? "(missing)";
  console.log(`\n--- artifact/${cls.name}: local edits (sha=${cls.localHash.slice(0, 8)}...) ---`);
  console.log(local.split("\n").slice(0, 30).join("\n"));
  console.log("--- (showing first 30 lines; use git diff for full) ---\n");
}
