/**
 * Detect which AI editor(s) are present in the repo. The detection is
 * directory-based — the absence of these directories doesn't mean the
 * user doesn't use the editor; it means we don't have evidence to act
 * on. `--editor=<name>` overrides detection.
 *
 * The 10 supported hosts mirror gstack's host coverage. Detection order
 * doubles as the auto-select priority when only one editor is present.
 */

import { statSync } from "node:fs";
import { join } from "node:path";

export type EditorName =
  | "claude-code"
  | "cursor"
  | "cline"
  | "zed"
  | "continue"
  | "codex"
  | "factory"
  | "hermes"
  | "kiro"
  | "opencode";

export interface DetectedEditor {
  name: EditorName;
  marker: string;
}

const ORDER: { name: EditorName; marker: string }[] = [
  { name: "claude-code", marker: ".claude" },
  { name: "cursor", marker: ".cursor" },
  { name: "cline", marker: ".cline" },
  { name: "zed", marker: ".zed" },
  { name: "continue", marker: ".continue" },
  { name: "codex", marker: ".codex" },
  { name: "factory", marker: ".factory" },
  { name: "hermes", marker: ".hermes" },
  { name: "kiro", marker: ".kiro" },
  { name: "opencode", marker: ".opencode" },
];

export function detectEditors(repoRoot: string = process.cwd()): DetectedEditor[] {
  const found: DetectedEditor[] = [];
  for (const { name, marker } of ORDER) {
    try {
      const s = statSync(join(repoRoot, marker));
      if (s.isDirectory()) found.push({ name, marker });
    } catch {
      // not present
    }
  }
  return found;
}

export const ALL_EDITORS: EditorName[] = ORDER.map((e) => e.name);
