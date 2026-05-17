/**
 * Shared types for per-editor MCP config writers. Each writer reads
 * the editor's existing config (if any), merges a `coznt` entry into
 * it (non-destructively), and writes back.
 */

export interface CozntMcpEntry {
  /** What command to spawn the MCP server with. Customer-controlled. */
  command: string;
  /** Args passed to the command. */
  args: string[];
  /** Env merged into the spawned process. */
  env: Record<string, string>;
}

export interface WriteResult {
  /** Path to the file that was written. */
  path: string;
  /** True if the file existed before. */
  merged: boolean;
  /** True if a prior coznt entry was overwritten. */
  overwrote: boolean;
}

export interface WriterContext {
  repoRoot: string;
  cozntEntry: CozntMcpEntry;
}
