/**
 * `coznt walkthrough` — print the bootstrap prompt for paste into a coding
 * agent. The agent then executes the 8-step flow against the connected
 * coznt project: read verification debt + outcomes, map incidents to code,
 * and propose `.agents/skills/`, `.agents/rules/`, and `.agents/plans/`
 * files via the `propose_artifact` MCP verb.
 *
 * Spec: docs/spec/dev-authoring-surface.md §15.
 */

import { walkthroughPrompt, walkthroughVersion } from "../../lib/walkthrough/prompt";

export interface WalkthroughOpts {
  /**
   * When true, print just the prompt body — no banner or version line.
   * Useful for piping directly into an editor: `coznt walkthrough --raw | pbcopy`.
   */
  raw?: boolean;
}

export async function runWalkthrough(opts: WalkthroughOpts): Promise<number> {
  if (opts.raw) {
    process.stdout.write(walkthroughPrompt);
    return 0;
  }
  const banner = [
    `# coznt walkthrough (v${walkthroughVersion})`,
    `#`,
    `# Paste the prompt below into Claude Code, Cursor, or another MCP-aware`,
    `# coding agent. The agent reads this project's autonomy ledger, maps`,
    `# real incidents to code, and proposes \`.agents/\` files via PR.`,
    `#`,
    `# To pipe just the prompt: \`coznt walkthrough --raw\``,
    ``,
  ].join("\n");
  process.stdout.write(banner);
  process.stdout.write(walkthroughPrompt);
  return 0;
}
