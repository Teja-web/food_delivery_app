/**
 * Resolve an `apiKeyRef` to a plaintext API key. Never logs the value.
 *
 * `env` backend: reads `process.env[name]`.
 * `keychain` backend: shells out to the OS-native CLI (`security`
 * on macOS, `secret-tool` on Linux). On Windows, falls back to an
 * env-var fallback (`COZNT_API_KEY_<account>`) since `wincred` access
 * via shell is awkward; a richer Windows backend lands later.
 *
 * Errors reference the *location* of the key, never its value.
 */

import { execFileSync } from "node:child_process";
import { platform } from "node:os";

import type { ApiKeyRef } from "./config.js";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function readFromEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AuthError(
      `API key env var '${name}' is not set. Export it or rerun \`coznt connect\` with a different --api-key-env value.`,
    );
  }
  return value;
}

function readFromKeychain(account: string): string {
  const os = platform();
  try {
    if (os === "darwin") {
      const out = execFileSync(
        "security",
        ["find-generic-password", "-s", "coznt", "-a", account, "-w"],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
      );
      return out.trim();
    }
    if (os === "linux") {
      const out = execFileSync(
        "secret-tool",
        ["lookup", "service", "coznt", "account", account],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
      );
      return out.trim();
    }
    // Windows + everything else: env-var fallback
    const envName = `COZNT_API_KEY_${account.replace(/[^A-Z0-9_]/gi, "_").toUpperCase()}`;
    return readFromEnv(envName);
  } catch (e) {
    throw new AuthError(
      `Could not read API key from keychain (account='coznt:${account}'). ${
        (e as Error).message
      }`,
    );
  }
}

export function writeToKeychain(account: string, secret: string): void {
  const os = platform();
  try {
    if (os === "darwin") {
      // Delete any prior entry, then add. -U updates, but a stale entry from
      // a previous account spelling can cause silent failures.
      try {
        execFileSync("security", ["delete-generic-password", "-s", "coznt", "-a", account], {
          stdio: ["ignore", "ignore", "ignore"],
        });
      } catch {
        // ignore — no prior entry
      }
      execFileSync(
        "security",
        ["add-generic-password", "-s", "coznt", "-a", account, "-w", secret],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      return;
    }
    if (os === "linux") {
      // secret-tool reads the secret from stdin.
      const proc = execFileSync(
        "secret-tool",
        ["store", "--label=coznt", "service", "coznt", "account", account],
        { input: secret, stdio: ["pipe", "ignore", "pipe"] },
      );
      void proc;
      return;
    }
    throw new AuthError(
      `Keychain storage not supported on ${os}. Re-run with --api-key-env=<NAME> to use env-var indirection instead.`,
    );
  } catch (e) {
    throw new AuthError(`Failed to write API key to keychain: ${(e as Error).message}`);
  }
}

export function resolveApiKey(ref: ApiKeyRef): string {
  if (ref.kind === "env") return readFromEnv(ref.name);
  if (ref.kind === "keychain") return readFromKeychain(ref.account);
  throw new AuthError(`Unknown apiKeyRef kind: ${(ref as { kind: string }).kind}`);
}
