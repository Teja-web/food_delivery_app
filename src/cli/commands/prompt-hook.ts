/**
 * `coznt prompt-hook <subcommand>` — manage the Claude Code
 * UserPromptSubmit hook coznt installs to capture and grade prompts.
 *
 * Subcommands:
 *   uninstall   — remove the hook entry from `.claude/settings*.json`
 *                 and clear `promptHook.installed` in `.coznt/config.json`.
 */

import { readConfig, writeConfig, ConfigError } from "../lib/config.js";
import { uninstallClaudePromptHook } from "../lib/prompt-hook-installer.js";

export interface PromptHookOptions {
  subcommand: string | null;
}

export async function runPromptHook(opts: PromptHookOptions): Promise<number> {
  switch (opts.subcommand) {
    case "uninstall":
      return runUninstall();
    case "status":
      return runStatus();
    case null:
    case undefined:
    case "help":
      printHelp();
      return opts.subcommand === "help" ? 0 : 1;
    default:
      console.error(`Unknown prompt-hook subcommand: ${opts.subcommand}`);
      printHelp();
      return 1;
  }
}

function printHelp(): void {
  console.log(
    [
      "coznt prompt-hook — manage the Claude Code UserPromptSubmit hook",
      "",
      "Usage:",
      "  coznt prompt-hook uninstall   Remove the hook and update .coznt/config.json",
      "  coznt prompt-hook status      Show whether the hook is installed",
      "",
      "Use `coznt connect --install-prompt-hook` to install.",
    ].join("\n"),
  );
}

function runUninstall(): number {
  const repoRoot = process.cwd();
  const res = uninstallClaudePromptHook(repoRoot);
  if (res.removed) {
    console.log(`✓ Removed coznt prompt-hook from ${res.path}`);
  } else {
    console.log(`No coznt prompt-hook entry found in ${res.path ?? ".claude/settings.json"}.`);
  }

  // Update .coznt/config.json best-effort — missing config is fine,
  // hook can be uninstalled even before connect ran.
  try {
    const cfg = readConfig(repoRoot);
    writeConfig(
      { ...cfg, promptHook: { installed: false, version: null, editor: null } },
      repoRoot,
    );
    console.log(`✓ Updated .coznt/config.json`);
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
  }
  return 0;
}

function runStatus(): number {
  const repoRoot = process.cwd();
  try {
    const cfg = readConfig(repoRoot);
    const h = cfg.promptHook;
    if (!h?.installed) {
      console.log("prompt-hook: not installed");
      return 0;
    }
    console.log(
      `prompt-hook: installed (version=${h.version ?? "unknown"}, editor=${h.editor ?? "unknown"})`,
    );
    return 0;
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error("No .coznt/config.json — run `coznt connect` first.");
      return 1;
    }
    throw e;
  }
}
