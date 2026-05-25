/**
 * Write the current project phase to `.coznt/project-phase.txt` after
 * every successful `get_my_context` call. The Claude Code UserPromptSubmit
 * hook reads this file when scoring offline (it can't make a network call —
 * <100ms budget). Stale data is acceptable; the server-side rescore on
 * `log_prompt` arrival corrects mismatches.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

const DIR = ".coznt";
const FILE = "project-phase.txt";

export async function writeProjectPhaseCache(
  workspaceDir: string,
  phase: string,
): Promise<void> {
  const dir = path.join(workspaceDir, DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, FILE), phase.endsWith("\n") ? phase : phase + "\n", "utf8");
}

export async function readProjectPhaseCache(workspaceDir: string): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(workspaceDir, DIR, FILE), "utf8");
    return content.trim() || null;
  } catch {
    return null;
  }
}
