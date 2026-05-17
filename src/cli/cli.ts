#!/usr/bin/env node
/**
 * coznt CLI entry point.
 *
 * Subcommands:
 *   coznt sync    — pull choreographies into .coznt/skills/
 *   coznt connect — bootstrap MCP wiring (added in add-coznt-connect-cli)
 *
 * Argument parsing is hand-rolled to keep the dep tree small. Each
 * subcommand parses its own flags.
 */

import { runSync } from "./commands/sync.js";
import { runConnect } from "./commands/connect.js";

interface ParsedArgs {
  subcommand: string | null;
  flags: Map<string, string | boolean>;
  positional: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  let subcommand: string | null = null;
  let rest: string[] = argv.slice(2);
  if (rest.length > 0 && !rest[0].startsWith("--")) {
    subcommand = rest[0];
    rest = rest.slice(1);
  }
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      if (eq !== -1) {
        flags.set(tok.slice(2, eq), tok.slice(eq + 1));
      } else {
        const next = rest[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags.set(tok.slice(2), next);
          i++;
        } else {
          flags.set(tok.slice(2), true);
        }
      }
    } else {
      positional.push(tok);
    }
  }

  return { subcommand, flags, positional };
}

function printUsage(): void {
  console.log(
    [
      "coznt — push the choreography, keep the daemon",
      "",
      "Usage:",
      "  coznt sync [--force] [--dry-run]",
      "      Pull the current project's choreographies into <repo>/.coznt/skills/.",
      "",
      "  coznt connect [--editor=<name>] [--project=<slug>] [--server=<url>]",
      "                 [--api-key-env=<NAME>] [--mcp-launcher=<cmd>]",
      "      Bootstrap MCP wiring + initial sync. Detects editor, prompts",
      "      for API key, stores it in OS keychain (default) or env-var.",
      "",
      "  coznt --version",
      "  coznt --help",
      "",
      "Documentation: docs/operate/cli.md",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.flags.has("version") || args.subcommand === "version") {
    console.log("coznt 0.1.0");
    process.exit(0);
  }

  if (!args.subcommand || args.subcommand === "help" || args.flags.has("help")) {
    printUsage();
    process.exit(args.subcommand ? 0 : 1);
  }

  try {
    switch (args.subcommand) {
      case "sync": {
        const code = await runSync({
          force: Boolean(args.flags.get("force")),
          dryRun: Boolean(args.flags.get("dry-run")),
        });
        process.exit(code);
        break;
      }
      case "connect": {
        const code = await runConnect({
          editor: args.flags.get("editor") as string | undefined,
          project: args.flags.get("project") as string | undefined,
          serverUrl: args.flags.get("server") as string | undefined,
          apiKeyEnv: args.flags.get("api-key-env") as string | undefined,
          mcpLauncher: args.flags.get("mcp-launcher") as string | undefined,
        });
        process.exit(code);
        break;
      }
      default: {
        console.error(`Unknown subcommand: ${args.subcommand}`);
        printUsage();
        process.exit(1);
      }
    }
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
}

void main();
