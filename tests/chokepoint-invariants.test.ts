/**
 * Build-time chokepoint invariants.
 *
 * gstack's v1.40 pattern: ship a centralized helper + a static-source test
 * that fails CI when anyone bypasses it. We protect four chokepoints:
 *
 *   1. LLM execution flows through `src/lib/ai/` — bypasses skip the
 *      autonomy ledger (outcomes aren't recorded for raw SDK calls).
 *   2. `skill_outcomes` writes flow through `src/operations/skill/skill-autonomy.ts`
 *      — bypasses skip the autonomy-recompute trigger.
 *   3. `audit_logs` writes flow through a named allow-list — bypasses skip
 *      the hash chain when it lands.
 *   4. `GateVerdictResult` objects come from `src/operations/gate/execution-gate.ts`
 *      — bypasses skip rule evaluation.
 *
 * The tests scan `.ts` / `.tsx` under `src/` (excluding test files and
 * node_modules) using regex. They are intentionally dumb — runtime checks
 * can be bypassed in mocks; build-time pattern checks fail at import.
 *
 * When a legitimate exception is needed, add the file path to the
 * corresponding `*_ALLOWED` constant with a justification comment.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..");
const SRC_DIR = join(REPO_ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "dist") continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if ((extname(name) === ".ts" || extname(name) === ".tsx") && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function readSourceTree(): { path: string; rel: string; content: string }[] {
  return walk(SRC_DIR).map((path) => ({
    path,
    rel: relative(REPO_ROOT, path),
    content: readFileSync(path, "utf-8"),
  }));
}

// ─── Chokepoint 1: LLM execution ────────────────────────────────────────

const LLM_SDK_PATTERNS = [
  /from\s+["']openai["']/,
  /from\s+["']@ai-sdk\/openai["']/,
  /from\s+["']@ai-sdk\/groq["']/,
  /from\s+["']anthropic["']/,
  /from\s+["']@anthropic-ai\/sdk["']/,
  /from\s+["']ai["']/,
];

// Files allowed to import LLM SDKs directly. Every entry has a justification.
const LLM_ALLOWED: { path: string; reason: string }[] = [
  {
    path: "src/lib/ai/index.ts",
    reason: "canonical generate() / embed() wrapper — this IS the chokepoint",
  },
  {
    path: "src/lib/search/hybrid.ts",
    reason:
      "hybrid FTS+vector search uses ai-sdk embed() for query embedding; the call path is read-side, not generative, and the autonomy ledger doesn't apply to it",
  },
  {
    path: "src/worker.ts",
    reason:
      "worker daemon configures the ai-sdk embedding provider for the pgmq job loop; routing all jobs through @/lib/ai would add an indirection without changing the chokepoint",
  },
];

describe("Chokepoint: LLM execution flows through src/lib/ai", () => {
  it("no production file outside the allow-list imports an LLM SDK directly", () => {
    const allowed = new Set(LLM_ALLOWED.map((e) => e.path));
    const tree = readSourceTree();
    const violations: { file: string; pattern: string }[] = [];

    for (const file of tree) {
      if (allowed.has(file.rel)) continue;
      for (const pattern of LLM_SDK_PATTERNS) {
        if (pattern.test(file.content)) {
          violations.push({ file: file.rel, pattern: pattern.source });
          break;
        }
      }
    }

    expect(violations, formatViolations("LLM SDK import bypass", violations)).toEqual([]);
  });
});

// ─── Chokepoint 2: skill_outcomes writes ────────────────────────────────

const SKILL_OUTCOMES_WRITE_PATTERNS = [/\.insert\(skillOutcomes\)/, /\.update\(skillOutcomes\)/];

const SKILL_OUTCOMES_ALLOWED: { path: string; reason: string }[] = [
  {
    path: "src/operations/skill/skill-autonomy.ts",
    reason: "canonical recordSkillOutcome / recordAssessorOutcome — the chokepoint",
  },
];

describe("Chokepoint: skill_outcomes writes through skill-autonomy.ts", () => {
  it("no production file outside the allow-list inserts/updates skill_outcomes directly", () => {
    const allowed = new Set(SKILL_OUTCOMES_ALLOWED.map((e) => e.path));
    const tree = readSourceTree();
    const violations: { file: string; pattern: string }[] = [];

    for (const file of tree) {
      if (allowed.has(file.rel)) continue;
      for (const pattern of SKILL_OUTCOMES_WRITE_PATTERNS) {
        if (pattern.test(file.content)) {
          violations.push({ file: file.rel, pattern: pattern.source });
          break;
        }
      }
    }

    expect(
      violations,
      formatViolations("skill_outcomes direct write bypass", violations),
    ).toEqual([]);
  });
});

// ─── Chokepoint 3: audit_logs writes ────────────────────────────────────

const AUDIT_LOGS_WRITE_PATTERNS = [/\.insert\(auditLogs\)/];

// audit_logs has no single helper today — instead we maintain an explicit
// allow-list of writers. Any new writer must be added here with a
// justification, or the audit chain hashing pipeline must be refactored to
// run through one helper.
const AUDIT_LOGS_ALLOWED: { path: string; reason: string }[] = [
  {
    path: "src/operations/skill/skill-autonomy.ts",
    reason: "promotion / demotion / review events on autonomy recompute",
  },
  {
    path: "src/operations/gate/execution-gate.ts",
    reason: "gate verdict records with enforcedByRuleId / policy source",
  },
  {
    path: "src/operations/gate/phase-advance.ts",
    reason: "phase-transition events (canonical SDLC milestone)",
  },
  {
    path: "src/operations/rule-engine.ts",
    reason: "rule violations recorded at write time",
  },
  {
    path: "src/app/api/v1/mcp/sessions/route.ts",
    reason: "mcp.session_start — first audit row of every MCP session",
  },
  {
    path: "src/app/api/v1/mcp/sessions/[id]/end/route.ts",
    reason: "mcp.session_end — closes the session span in the audit log",
  },
];

describe("Chokepoint: audit_logs writes through the named allow-list", () => {
  it("no file outside the allow-list inserts into audit_logs", () => {
    const allowed = new Set(AUDIT_LOGS_ALLOWED.map((e) => e.path));
    const tree = readSourceTree();
    const violations: { file: string; pattern: string }[] = [];

    for (const file of tree) {
      if (allowed.has(file.rel)) continue;
      for (const pattern of AUDIT_LOGS_WRITE_PATTERNS) {
        if (pattern.test(file.content)) {
          violations.push({ file: file.rel, pattern: pattern.source });
          break;
        }
      }
    }

    expect(
      violations,
      formatViolations("audit_logs direct write bypass", violations),
    ).toEqual([]);
  });

  it("every entry in AUDIT_LOGS_ALLOWED has a non-empty reason", () => {
    for (const entry of AUDIT_LOGS_ALLOWED) {
      expect(entry.reason.length, `${entry.path} needs a justification`).toBeGreaterThan(10);
    }
  });
});

// ─── Chokepoint 4: GateVerdictResult construction ───────────────────────

// We look for literal verdict construction outside the gate. Production
// code that returns a GateVerdictResult must call `decideExecutionGate`.
// Pattern: a literal object that mentions `verdict:` with one of the
// known gate verdicts AND `reason:` in the same expression.
const GATE_VERDICT_PATTERN =
  /\bverdict\s*:\s*["'](success|failure|neutral|skipped)["'][\s\S]{0,80}?\breason\s*:/;

const GATE_VERDICT_ALLOWED: { path: string; reason: string }[] = [
  {
    path: "src/operations/gate/execution-gate.ts",
    reason: "decideExecutionGate — the chokepoint producer of GateVerdictResult",
  },
];

describe("Chokepoint: GateVerdictResult comes from execution-gate.ts", () => {
  it("no production file outside the allow-list constructs gate verdict literals", () => {
    const allowed = new Set(GATE_VERDICT_ALLOWED.map((e) => e.path));
    const tree = readSourceTree();
    const violations: { file: string; pattern: string }[] = [];

    for (const file of tree) {
      if (allowed.has(file.rel)) continue;
      if (GATE_VERDICT_PATTERN.test(file.content)) {
        violations.push({ file: file.rel, pattern: GATE_VERDICT_PATTERN.source });
      }
    }

    expect(
      violations,
      formatViolations("gate verdict construction bypass", violations),
    ).toEqual([]);
  });
});

// ─── Shared helpers ─────────────────────────────────────────────────────

function formatViolations(
  label: string,
  violations: { file: string; pattern: string }[],
): string {
  if (violations.length === 0) return "";
  const lines = violations.map((v) => `  - ${v.file} matched /${v.pattern}/`);
  return [
    `${label}: ${violations.length} violation(s).`,
    "Either refactor through the chokepoint OR add to the corresponding *_ALLOWED list with a justification.",
    "",
    ...lines,
  ].join("\n");
}
