/**
 * `.coznt/config.json` — connection metadata written by `coznt connect`
 * and read by `coznt sync`.
 *
 * Never stores the plaintext API key. Holds a reference (`apiKeyRef`)
 * that points at the actual key location (env var or OS keychain).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export type ApiKeyRef =
  | { kind: "env"; name: string }
  | { kind: "keychain"; account: string };

export interface CozntConfig {
  serverUrl: string;
  projectId: string;
  apiKeyRef: ApiKeyRef;
}

const CONFIG_PATH = ".coznt/config.json";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function validateConfig(raw: unknown): CozntConfig {
  if (!raw || typeof raw !== "object") {
    throw new ConfigError("`.coznt/config.json` is not a JSON object");
  }
  const c = raw as Record<string, unknown>;
  if (typeof c.serverUrl !== "string" || !c.serverUrl) {
    throw new ConfigError("`serverUrl` must be a non-empty string");
  }
  if (typeof c.projectId !== "string" || !c.projectId) {
    throw new ConfigError("`projectId` must be a non-empty string");
  }
  if (!c.apiKeyRef || typeof c.apiKeyRef !== "object") {
    throw new ConfigError("`apiKeyRef` must be an object");
  }
  const ref = c.apiKeyRef as Record<string, unknown>;
  if (ref.kind === "env") {
    if (typeof ref.name !== "string" || !ref.name) {
      throw new ConfigError("apiKeyRef.kind=env requires a `name` string");
    }
  } else if (ref.kind === "keychain") {
    if (typeof ref.account !== "string" || !ref.account) {
      throw new ConfigError("apiKeyRef.kind=keychain requires an `account` string");
    }
  } else {
    throw new ConfigError("apiKeyRef.kind must be 'env' or 'keychain'");
  }
  return {
    serverUrl: c.serverUrl.replace(/\/$/, ""),
    projectId: c.projectId,
    apiKeyRef: c.apiKeyRef as ApiKeyRef,
  };
}

export function readConfig(repoRoot: string = process.cwd()): CozntConfig {
  const path = join(repoRoot, CONFIG_PATH);
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    throw new ConfigError(
      `${CONFIG_PATH} not found. Run \`coznt connect\` first.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError(`${CONFIG_PATH} is not valid JSON: ${(e as Error).message}`);
  }
  return validateConfig(parsed);
}

export function writeConfig(cfg: CozntConfig, repoRoot: string = process.cwd()): void {
  const path = join(repoRoot, CONFIG_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}
