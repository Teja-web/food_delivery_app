/**
 * Install / uninstall the Claude Code `UserPromptSubmit` hook that
 * captures every prompt and scores it locally against the rubric.
 *
 * The hook entry runs `npx -y <serverUrl>/install/coznt-prompt-hook/latest`.
 * Writes to `.claude/settings.json` (or `.claude/settings.local.json` when
 * present). Refuses to overwrite a foreign hook unless `--force`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const COZNT_HOOK_MARKER = "coznt-prompt-hook";

type HookEntry = {
  type: "command";
  command: string;
};

interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}

interface ClaudeSettings {
  hooks?: {
    UserPromptSubmit?: HookGroup[];
    [k: string]: HookGroup[] | undefined;
  };
  [k: string]: unknown;
}

function resolveSettingsPath(repoRoot: string): string {
  const local = join(repoRoot, ".claude", "settings.local.json");
  if (existsSync(local)) return local;
  return join(repoRoot, ".claude", "settings.json");
}

function readJsonIfExists(path: string): ClaudeSettings {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ClaudeSettings;
  } catch {
    return {};
  }
}

function writeJson(path: string, data: ClaudeSettings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export interface InstallResult {
  path: string;
  installed: boolean;
  conflict: boolean;
  overwrote: boolean;
}

/**
 * Install the hook entry. Returns { installed: true } on success;
 * { conflict: true } when a non-coznt UserPromptSubmit hook is present
 * and force is false (caller should warn and abort).
 */
export function installClaudePromptHook(args: {
  repoRoot: string;
  serverUrl: string;
  force?: boolean;
}): InstallResult {
  const path = resolveSettingsPath(args.repoRoot);
  const settings = readJsonIfExists(path);
  settings.hooks ??= {};
  const existing = settings.hooks.UserPromptSubmit ?? [];

  const cozntCommand = `npx -y ${args.serverUrl.replace(/\/$/, "")}/install/coznt-prompt-hook/latest`;

  // Detect a prior coznt entry — replace in place — or a foreign entry —
  // conflict unless --force.
  let overwrote = false;
  const filtered: HookGroup[] = [];
  for (const group of existing) {
    const hasCoznt = group.hooks.some((h) => h.command.includes(COZNT_HOOK_MARKER));
    const hasForeign = group.hooks.some(
      (h) => !h.command.includes(COZNT_HOOK_MARKER),
    );
    if (hasCoznt && !hasForeign) {
      // Pure-coznt group — drop, we'll re-add fresh below.
      overwrote = true;
      continue;
    }
    if (hasForeign && !args.force) {
      return { path, installed: false, conflict: true, overwrote: false };
    }
    // Mixed group with --force, or pure-foreign with --force: strip coznt
    // entries but keep the rest, then we'll add a new pure-coznt group.
    const purged = group.hooks.filter((h) => !h.command.includes(COZNT_HOOK_MARKER));
    if (purged.length > 0) filtered.push({ ...group, hooks: purged });
    if (hasCoznt) overwrote = true;
  }

  filtered.push({
    hooks: [{ type: "command", command: cozntCommand }],
  });
  settings.hooks.UserPromptSubmit = filtered;

  writeJson(path, settings);
  return { path, installed: true, conflict: false, overwrote };
}

export interface UninstallResult {
  path: string | null;
  removed: boolean;
}

export function uninstallClaudePromptHook(repoRoot: string): UninstallResult {
  const path = resolveSettingsPath(repoRoot);
  if (!existsSync(path)) return { path: null, removed: false };
  const settings = readJsonIfExists(path);
  if (!settings.hooks?.UserPromptSubmit) return { path, removed: false };

  let removed = false;
  const remaining: HookGroup[] = [];
  for (const group of settings.hooks.UserPromptSubmit) {
    const purged = group.hooks.filter((h) => {
      if (h.command.includes(COZNT_HOOK_MARKER)) {
        removed = true;
        return false;
      }
      return true;
    });
    if (purged.length > 0) remaining.push({ ...group, hooks: purged });
  }

  if (remaining.length === 0) {
    delete settings.hooks.UserPromptSubmit;
  } else {
    settings.hooks.UserPromptSubmit = remaining;
  }
  writeJson(path, settings);
  return { path, removed };
}

/**
 * Fetch the current hook version served by the deployment.
 * Returns null on any failure — version drift is a warning, never fatal.
 */
export async function fetchCurrentHookVersion(serverUrl: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${serverUrl.replace(/\/$/, "")}/install/coznt-prompt-hook/version`,
      { redirect: "follow" },
    );
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
