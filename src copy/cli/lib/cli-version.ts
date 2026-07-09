/**
 * Resolve the running coznt CLI's version. Walks up from this file
 * until it finds a `package.json` whose `name` identifies the CLI
 * package. Handles both the dev path (this file in `src/cli/lib/`,
 * package.json at the repo root four levels up) and the installed
 * tarball path (this file in `cli/lib/`, package.json two levels up).
 *
 * Used by `coznt sync` to surface CLI-self drift: if the server has a
 * newer CLI tarball than the running CLI, sync nudges the user to
 * upgrade. The CLI itself is the one distribution channel sync can't
 * refresh on its own.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, parse } from "node:path";

const CLI_PACKAGE_NAMES = new Set(["coznt-cli", "coznt"]);

export function getRunningCliVersion(): string | null {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    const root = parse(dir).root;
    while (dir !== root) {
      const pkgPath = join(dir, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
          name?: unknown;
          version?: unknown;
        };
        if (
          typeof pkg.name === "string" &&
          CLI_PACKAGE_NAMES.has(pkg.name) &&
          typeof pkg.version === "string"
        ) {
          return pkg.version;
        }
      }
      dir = dirname(dir);
    }
    return null;
  } catch {
    return null;
  }
}
