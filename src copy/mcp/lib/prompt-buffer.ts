/**
 * Offline durability buffer for the agent-loop prompt-capture path.
 *
 * `.coznt/prompt-buffer.jsonl` lives in the dev's workspace dir. The
 * `log_prompt` MCP verb appends here when the platform POST fails;
 * `flush_local_prompts` (or the next successful `log_prompt` retry) drains
 * the file. JSONL because append is atomic and recovery is line-oriented.
 *
 * No `@/` imports — this module ships in the MCP CLI bundle.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

const BUFFER_DIRNAME = ".coznt";
const BUFFER_FILENAME = "prompt-buffer.jsonl";

export interface BufferedPrompt {
  localId: string;
  capturedAt: string; // ISO
  projectId: string | null;
  mcpSessionId: string | null;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  source: string;
  content: string;
  phase: string | null;
  authorName: string | null;
  authorUsername: string | null;
  authorEmail: string | null;
  prescored: {
    overallScore: number;
    tier: "GOOD" | "NEEDS_IMPROVEMENT" | "POOR";
    dimensions: Record<string, number>;
    suggestions: string[];
    flags: string[];
    rubricVersion: string;
  } | null;
}

export function getPromptBufferPath(workspaceDir: string): string {
  return path.join(workspaceDir, BUFFER_DIRNAME, BUFFER_FILENAME);
}

export async function ensurePromptBufferScaffold(workspaceDir: string): Promise<string> {
  const dir = path.join(workspaceDir, BUFFER_DIRNAME);
  await fs.mkdir(dir, { recursive: true });
  return getPromptBufferPath(workspaceDir);
}

export async function appendToLocalBuffer(
  workspaceDir: string,
  entry: Omit<BufferedPrompt, "localId" | "capturedAt"> & {
    localId?: string;
    capturedAt?: string;
  },
): Promise<BufferedPrompt> {
  const file = await ensurePromptBufferScaffold(workspaceDir);
  const full: BufferedPrompt = {
    localId: entry.localId ?? randomUUID(),
    capturedAt: entry.capturedAt ?? new Date().toISOString(),
    projectId: entry.projectId,
    mcpSessionId: entry.mcpSessionId,
    role: entry.role,
    source: entry.source,
    content: entry.content,
    phase: entry.phase,
    authorName: entry.authorName,
    authorUsername: entry.authorUsername,
    authorEmail: entry.authorEmail,
    prescored: entry.prescored,
  };
  await fs.appendFile(file, JSON.stringify(full) + "\n", "utf8");
  return full;
}

export async function readLocalBuffer(workspaceDir: string): Promise<BufferedPrompt[]> {
  const file = getPromptBufferPath(workspaceDir);
  try {
    const data = await fs.readFile(file, "utf8");
    return data
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as BufferedPrompt);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function truncateLocalBuffer(workspaceDir: string): Promise<void> {
  const file = getPromptBufferPath(workspaceDir);
  try {
    await fs.writeFile(file, "", "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

export async function writeLocalBuffer(
  workspaceDir: string,
  entries: BufferedPrompt[],
): Promise<void> {
  const file = await ensurePromptBufferScaffold(workspaceDir);
  await fs.writeFile(
    file,
    entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : ""),
    "utf8",
  );
}
