/**
 * `coznt connect` — one-shot bootstrap.
 *
 * Detects the editor, writes the editor's MCP config to point at the
 * customer's coznt MCP server, writes `.coznt/config.json`, prompts
 * for the API key, stores it via OS keychain (or env-var indirection
 * with --api-key-env=NAME), runs `coznt sync` to populate the initial
 * choreography bundle, and ensures `.coznt/.local/` is gitignored.
 *
 * Writes ONLY wiring + guidance to the dev's local repo — never to
 * external systems. Consistent with the setup_workspace exclusion in
 * src/mcp/server.ts.
 */

import { writeFileSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  detectEditors,
  type EditorName,
  ALL_EDITORS,
} from "../lib/editor-detect";
import { writeForEditor } from "../lib/mcp-config-writers/index";
import { writeConfig, type ApiKeyRef } from "../lib/config";
import { writeToKeychain } from "../lib/auth";
import { ensureCozntLocalGitignored } from "../lib/gitignore";
import { pickProject } from "../lib/project-picker";
import { ask, askChoice, askSecret } from "../lib/prompt";
import { runSync } from "./sync";
import { tarballUrl } from "../../lib/agent-context/host-config";
import { MCP_VERSION } from "../../lib/agent-context/version";
import {
  installClaudePromptHook,
  fetchCurrentHookVersion,
} from "../lib/prompt-hook-installer";
import { writePostureFiles } from "../lib/posture-writer";

export interface ConnectOptions {
  editor?: string;
  project?: string;
  serverUrl?: string;
  apiKeyEnv?: string;
  mcpLauncher?: string;
  /**
   * Override the prompt-hook install default. Default behavior:
   *   - claude-code editor: install
   *   - any other editor: skip
   * Pass `false` to suppress, `true` to force-install regardless of editor.
   */
  installPromptHook?: boolean;
  /** Overwrite a foreign UserPromptSubmit hook instead of erroring. */
  force?: boolean;
}

const DEFAULT_SERVER = "http://localhost:3029";

function parseEditor(input: string | undefined, available: EditorName[]): EditorName | null {
  if (!input) return null;
  const norm = input.toLowerCase().replace(/_/g, "-");
  const match = (ALL_EDITORS as string[]).find((e) => e === norm);
  if (!match) {
    throw new Error(
      `--editor must be one of: ${ALL_EDITORS.join(", ")}. Got '${input}'.`,
    );
  }
  if (available.length > 0 && !available.includes(match as EditorName)) {
    console.warn(
      `Warning: --editor=${match} but no '${match}'-marker directory in this repo. Writing anyway.`,
    );
  }
  return match as EditorName;
}

async function chooseEditor(options: ConnectOptions): Promise<EditorName> {
  const detected = detectEditors();
  const explicit = parseEditor(options.editor, detected.map((d) => d.name));
  if (explicit) return explicit;

  if (detected.length === 0) {
    console.log(
      `No editor config directory detected. Supported: ${ALL_EDITORS.join(", ")}.`,
    );
    const answer = await askChoice(
      "Which editor are you using?",
      [...ALL_EDITORS],
    );
    return answer as EditorName;
  }
  if (detected.length === 1) {
    console.log(`Detected ${detected[0].name} (${detected[0].marker}/). Using it.`);
    return detected[0].name;
  }
  console.log("Multiple editors detected:");
  detected.forEach((d, i) => console.log(`  ${i + 1}. ${d.name} (${d.marker}/)`));
  while (true) {
    const answer = await ask(`Pick one (1-${detected.length}): `);
    const idx = parseInt(answer, 10);
    if (!Number.isNaN(idx) && idx >= 1 && idx <= detected.length) {
      return detected[idx - 1].name;
    }
    console.error("Please enter a number from the list.");
  }
}

function writeReadme(repoRoot: string): void {
  const path = join(repoRoot, ".coznt", "README.md");
  try {
    statSync(path);
    return; // don't overwrite
  } catch {
    // not present
  }
  mkdirSync(join(repoRoot, ".coznt"), { recursive: true });
  const body = `# .coznt/

This directory is managed by the coznt CLI. Files here:

- **config.json** — connection metadata (server URL, project ID, API-key reference). Safe to commit; never holds the plaintext key.
- **skills/** — workflow choreographies pulled by \`coznt sync\`. Committed by design so teammates get them on \`git pull\`. Each skill has a \`SKILL.md\` (the workflow guide your AI editor consumes) and a \`.lock\` (per-skill content hash for drift detection).
- **artifacts/** — exact organization/project artifacts pulled by \`coznt sync\`. Read these before coding, UI design, architecture decisions, or brand-sensitive work.
- **.local/** — per-developer cache. Gitignored.

Refresh with \`coznt sync\`. Re-bootstrap with \`coznt connect\`.

See [docs/operate/cli.md](../docs/operate/cli.md) for the full reference.
`;
  writeFileSync(path, body, "utf-8");
}

export async function runConnect(options: ConnectOptions = {}): Promise<number> {
  const repoRoot = process.cwd();
  const serverUrl = (options.serverUrl ?? DEFAULT_SERVER).replace(/\/$/, "");

  console.log(`coznt connect — server ${serverUrl}`);

  // 1. Editor
  const editor = await chooseEditor(options);

  // 2. API key (need it to call /api/v1/projects)
  const apiKey = await askSecret("API key (from coznt's /api-keys page): ");
  if (!apiKey) {
    console.error("No API key provided. Aborting.");
    return 1;
  }

  // 3. Project picker
  const picked = await pickProject(serverUrl, apiKey, options.project);
  console.log(`✓ Project: ${picked.name} (${picked.slug}, ${picked.id})`);

  // 4. Store the key
  let apiKeyRef: ApiKeyRef;
  if (options.apiKeyEnv) {
    apiKeyRef = { kind: "env", name: options.apiKeyEnv };
    console.log(
      `✓ apiKeyRef: env(${options.apiKeyEnv}). You must set this env var before running \`coznt sync\` or any AI-editor session.`,
    );
  } else {
    const account = `coznt:${picked.id}`;
    try {
      writeToKeychain(account, apiKey);
      apiKeyRef = { kind: "keychain", account };
      console.log(`✓ Stored API key in OS keychain (account: ${account})`);
    } catch (e) {
      console.warn(
        `Keychain storage failed: ${(e as Error).message}. Falling back to env-var indirection.`,
      );
      const envName = `COZNT_API_KEY_${picked.id.replace(/[^A-Z0-9_]/gi, "_").toUpperCase()}`;
      apiKeyRef = { kind: "env", name: envName };
      console.log(
        `✓ apiKeyRef: env(${envName}). Set this env var before running \`coznt sync\`.`,
      );
    }
  }

  // 5. Prompt-hook install (Claude Code only by default).
  const shouldInstallHook =
    options.installPromptHook ?? editor === "claude-code";
  let promptHookEntry: { installed: boolean; version: string | null; editor: string | null } = {
    installed: false,
    version: null,
    editor: null,
  };
  if (shouldInstallHook) {
    if (editor !== "claude-code" && options.installPromptHook !== true) {
      console.log(`Skipping prompt-hook install: editor=${editor} not supported.`);
    } else {
      const res = installClaudePromptHook({ repoRoot, serverUrl, force: options.force });
      if (res.conflict) {
        console.error(
          `A non-coznt UserPromptSubmit hook already exists in ${res.path}. Re-run with --force to overwrite.`,
        );
        return 1;
      }
      const version = await fetchCurrentHookVersion(serverUrl);
      promptHookEntry = { installed: true, version, editor };
      console.log(
        `✓ Installed prompt-hook in ${res.path}${res.overwrote ? " (replaced prior coznt entry)" : ""}`,
      );
    }
  }

  // 6. .coznt/config.json — record the MCP version we're about to wire
  // into the editor config (step 9). Sync compares this against the
  // server's current version to detect drift.
  writeConfig(
    {
      serverUrl,
      projectId: picked.id,
      apiKeyRef,
      promptHook: promptHookEntry,
      mcp: { version: MCP_VERSION },
    },
    repoRoot,
  );
  console.log(`✓ Wrote .coznt/config.json`);

  // 7. .gitignore — ensure both `.coznt/.local/` and `.mcp.json` are
  // ignored. The latter is critical now that we write the plaintext key
  // there by default (see step 9).
  const gi = ensureCozntLocalGitignored(repoRoot);
  if (gi.changed) {
    for (const e of gi.addedEntries) {
      console.log(`✓ Added ${e} to .gitignore`);
    }
  }

  // 8. .coznt/README.md
  writeReadme(repoRoot);

  // 8b. Editor-agnostic posture (AGENTS.md) + editor-native posture file
  // (CLAUDE.md / .cursor/rules / .rules). Idempotent — re-runs replace
  // the managed block between markers and leave user content alone.
  const postures = writePostureFiles(repoRoot, editor);
  for (const p of postures) {
    if (!p.changed) continue;
    const verb = p.replaced ? "Refreshed" : p.existed ? "Updated" : "Wrote";
    console.log(`✓ ${verb} ${p.path}`);
  }

  // 9. Editor MCP config — default to the tarball this coznt instance serves
  // (`npx -y https://<server>/install/coznt-mcp-<version>.tgz`). Mirrors
  // renderHostConfig's default; --mcp-launcher overrides for monorepo dev.
  const launcher = options.mcpLauncher ?? "npx";
  const launcherArgs =
    options.mcpLauncher === undefined ? ["-y", tarballUrl(serverUrl, MCP_VERSION)] : [];
  // Pick what to put in `COZNT_API_KEY`:
  //   - env-ref mode (--api-key-env=NAME): the literal string `${NAME}`,
  //     which editors that do env substitution (Claude Code, Cursor, …)
  //     expand at MCP-server spawn time. Key never lands on disk.
  //   - default (keychain mode): the plaintext key. The MCP config file
  //     is .gitignored (.mcp.json for Claude Code is added to .gitignore
  //     above), and the keychain entry persists as a recovery copy. This
  //     "works on first restart with no extra setup" path is what the
  //     v0.1.x walkthrough optimizes for. A future `--keychain-launcher`
  //     mode would point the editor at a wrapper that resolves the key
  //     at spawn time without touching disk; not implemented yet.
  const apiKeyEnvValue =
    apiKeyRef.kind === "env" ? `\${${apiKeyRef.name}}` : apiKey;
  const cozntEntry = {
    command: launcher,
    args: launcherArgs,
    env: {
      COZNT_URL: serverUrl,
      COZNT_API_KEY: apiKeyEnvValue,
    },
  };
  const wrote = writeForEditor(editor, { repoRoot, cozntEntry });
  console.log(
    `✓ Wrote ${wrote.path} (${wrote.merged ? "merged" : "new"}${wrote.overwrote ? ", overwrote prior coznt entry" : ""})`,
  );

  // 10. Initial sync
  console.log("");
  console.log("Running initial sync …");
  const syncCode = await runSync({});
  if (syncCode !== 0) {
    console.error(
      "Initial sync failed. Connect succeeded; fix the sync error and re-run `coznt sync`.",
    );
    return syncCode;
  }

  // 11. Final summary + verification hint.
  console.log("");
  console.log(`Connected to ${picked.name} on ${serverUrl}.`);
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Restart ${editor} (so it picks up ${wrote.path}).`);
  console.log(`  2. Ask the agent: \"Call get_my_context.\"`);
  console.log(`     The response should include phase, allowedTools, and skill autonomy.`);
  console.log(`     If you instead see \"tool not found\", the MCP config didn't load —`);
  console.log(`     verify ${wrote.path} exists and check the editor's MCP/server logs.`);
  return 0;
}
