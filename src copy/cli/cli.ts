#!/usr/bin/env node
/**
 * coznt CLI entry point.
 *
 * Subcommands:
 *   coznt sync    — pull choreographies + standards into .coznt/
 *   coznt connect — bootstrap MCP wiring (added in add-coznt-connect-cli)
 *
 * Argument parsing is hand-rolled to keep the dep tree small. Each
 * subcommand parses its own flags.
 */

import { runSync } from "./commands/sync";
import { runConnect } from "./commands/connect";
import { runPromptHook } from "./commands/prompt-hook";
import { MCP_VERSION } from "../lib/agent-context/version";
// `call` is dynamic-imported in its case branch — it pulls in src/mcp/ which
// is not packaged into the CLI tarball (see scripts/cli-pack.ts).

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
      "      Pull the current project's choreographies into <repo>/.coznt/skills/",
      "      and effective artifacts into <repo>/.coznt/artifacts/.",
      "",
      "  coznt connect [--editor=<name>] [--project=<slug>] [--server=<url>]",
      "                 [--api-key-env=<NAME>] [--mcp-launcher=<cmd>]",
      "                 [--install-prompt-hook|--no-install-prompt-hook]",
      "                 [--force]",
      "      Bootstrap MCP wiring + initial sync. Detects editor, prompts",
      "      for API key, stores it in OS keychain (default) or env-var.",
      "      Default-installs the Claude Code prompt hook when editor=claude-code.",
      "",
      "  coznt prompt-hook <uninstall|status>",
      "      Manage the Claude Code UserPromptSubmit prompt-capture hook.",
      "",
      "  coznt call <verb> [--flag value | --input '<json>']",
      "      Direct verb-dispatch over the MCP tool surface. Examples:",
      "        coznt call get_autonomy --skillSlug change-risk-classifier",
      "        coznt call get_verification_debt",
      "        coznt call upsert_plan --input '{\"kind\":\"spec\",\"slug\":\"x\",\"body\":\"...\"}'",
      "",
      "  coznt check [--slug <slug>] [--rules [--rule <slug>]] [--plans]",
      "      Validate .agents/ authoring artifacts on the current branch.",
      "      Surfaces frontmatter errors, skill/rule/plan files discovered, and",
      "      previews what would change on PR merge. Exit code 1 on errors.",
      "",
      "  coznt walkthrough [--raw]",
      "      Print the bootstrap prompt for paste into a coding agent. The",
      "      agent reads this project's autonomy ledger + 30d of outcomes and",
      "      proposes .agents/skills/, .agents/rules/, and .agents/plans/ files",
      "      via the propose_artifact MCP verb. --raw omits the banner.",
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
    console.log(MCP_VERSION);
    process.exitCode = 0;
    return;
  }

  if (!args.subcommand || args.subcommand === "help" || args.flags.has("help")) {
    printUsage();
    process.exitCode = args.subcommand || args.flags.has("help") ? 0 : 1;
    return;
  }

  try {
    let code = 0;
    switch (args.subcommand) {
      case "sync": {
        code = await runSync({
          force: Boolean(args.flags.get("force")),
          dryRun: Boolean(args.flags.get("dry-run")),
        });
        break;
      }
      case "connect": {
        // Parse tri-state --install-prompt-hook flag:
        //   not present     → undefined (default-by-editor)
        //   --install-prompt-hook       → true
        //   --no-install-prompt-hook    → false
        let installPromptHook: boolean | undefined;
        if (args.flags.has("install-prompt-hook")) {
          installPromptHook = true;
        } else if (args.flags.has("no-install-prompt-hook")) {
          installPromptHook = false;
        }
        code = await runConnect({
          editor: args.flags.get("editor") as string | undefined,
          project: args.flags.get("project") as string | undefined,
          serverUrl: args.flags.get("server") as string | undefined,
          apiKeyEnv: args.flags.get("api-key-env") as string | undefined,
          mcpLauncher: args.flags.get("mcp-launcher") as string | undefined,
          installPromptHook,
          force: Boolean(args.flags.get("force")),
        });
        break;
      }
      case "prompt-hook": {
        code = await runPromptHook({
          subcommand: args.positional[0] ?? null,
        });
        break;
      }
      case "check": {
        const { runCheck } = await import("./commands/check.js");
        code = await runCheck({
          slug: (args.flags.get("slug") as string | undefined) ?? (args.flags.get("rule") as string | undefined),
          rules: Boolean(args.flags.get("rules")),
          plans: Boolean(args.flags.get("plans")),
        });
        break;
      }
      case "walkthrough": {
        const { runWalkthrough } = await import("./commands/walkthrough.js");
        code = await runWalkthrough({
          raw: Boolean(args.flags.get("raw")),
        });
        break;
      }
      case "call": {
        const format = args.flags.get("format");
        const { runCall } = await import("./commands/call.js");
        code = await runCall({
          verb: args.positional[0] ?? null,
          flags: args.flags,
          format: format === "compact" ? "compact" : "json",
        });
        break;
      }
      default: {
        console.error(`Unknown subcommand: ${args.subcommand}`);
        printUsage();
        code = 1;
      }
    }
    process.exitCode = code;
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

void main();
