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
} from "../lib/editor-detect.js";
import { writeForEditor } from "../lib/mcp-config-writers/index.js";
import { writeConfig, type ApiKeyRef } from "../lib/config.js";
import { writeToKeychain } from "../lib/auth.js";
import { ensureCozntLocalGitignored } from "../lib/gitignore.js";
import { pickProject } from "../lib/project-picker.js";
import { ask, askChoice, askSecret } from "../lib/prompt.js";
import { runSync } from "./sync.js";

export interface ConnectOptions {
  editor?: string;
  project?: string;
  serverUrl?: string;
  apiKeyEnv?: string;
  mcpLauncher?: string;
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

  // 5. .coznt/config.json
  writeConfig({ serverUrl, projectId: picked.id, apiKeyRef }, repoRoot);
  console.log(`✓ Wrote .coznt/config.json`);

  // 6. .gitignore
  const gi = ensureCozntLocalGitignored(repoRoot);
  if (gi.changed) console.log(`✓ Added .coznt/.local/ to .gitignore`);

  // 7. .coznt/README.md
  writeReadme(repoRoot);

  // 8. Editor MCP config
  const launcher = options.mcpLauncher ?? "pnpm";
  const launcherArgs =
    options.mcpLauncher === undefined ? ["--filter", "coznt", "mcp"] : [];
  const cozntEntry = {
    command: launcher,
    args: launcherArgs,
    env: {
      COZNT_URL: serverUrl,
      // Inject the key by reference, not by value. The MCP server will
      // read COZNT_API_KEY from its own env. The customer is expected
      // to wire that env in their editor or shell. (Storing the key in
      // the editor's plaintext config file would defeat the whole point.)
      COZNT_API_KEY: apiKeyRef.kind === "env" ? `\${${apiKeyRef.name}}` : "REQUIRED",
    },
  };
  const wrote = writeForEditor(editor, { repoRoot, cozntEntry });
  console.log(
    `✓ Wrote ${wrote.path} (${wrote.merged ? "merged" : "new"}${wrote.overwrote ? ", overwrote prior coznt entry" : ""})`,
  );

  // 9. Initial sync
  console.log("");
  console.log("Running initial sync …");
  const syncCode = await runSync({});
  if (syncCode !== 0) {
    console.error(
      "Initial sync failed. Connect succeeded; fix the sync error and re-run `coznt sync`.",
    );
    return syncCode;
  }

  console.log("");
  console.log(`Connected. Restart ${editor} to load the MCP server.`);
  return 0;
}
