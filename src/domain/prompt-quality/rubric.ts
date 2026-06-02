/**
 * Canonical 6-dimension prompt-quality rubric.
 *
 * Single source of truth for prompt scoring. Pure, deterministic, zero LLM cost.
 * The hot path (UserPromptSubmit hook) runs the JS port generated from this
 * file by `scripts/generate-hook-rubric.ts`; the server runs this TS version
 * on every `log_prompt` POST and on every `rate_prompt` call.
 *
 * Bumping RUBRIC_VERSION triggers server-side rescore on next read of any
 * row whose `rubricVersion` is older. The hook's port records its own
 * version on every scored prompt so the server-side rescore is well-defined.
 */

import type { ProjectPhase } from "@/db/schema/project";
import type { PromptQualityTier } from "@/db/schema/prompt-log";

export const RUBRIC_VERSION = "1.0.0";

const VAGUE_PATTERNS = [
  /\bfix\s+(this|that|it)\b/i,
  /\bmake\s+(this|that|it)\s+work\b/i,
  /\bdo\s+(the|that)\s+thing\b/i,
  /\bhelp\b\s*$/i,
  /^\s*(help|please|wtf|huh|hmm)\s*[!?.]*\s*$/i,
];

const ACTION_VERBS = [
  "add",
  "remove",
  "rename",
  "implement",
  "refactor",
  "fix",
  "write",
  "create",
  "update",
  "delete",
  "design",
  "test",
  "document",
  "investigate",
  "audit",
  "migrate",
  "extract",
  "inline",
  "wire",
  "scaffold",
  "review",
  "verify",
];

const CONTEXT_SIGNALS = [
  /\bbecause\b/i,
  /\bso that\b/i,
  /\bin order to\b/i,
  /\bthe goal is\b/i,
  /\bcontext\b/i,
  /\bdriven by\b/i,
  /\bspec(?:ifi(?:cation|ed))?\b/i,
  /\bworkflow\b/i,
  /\bcurrent(?:ly)?\b/i,
  /\bissue\s+#?\d+/i,
  /\bPR\s+#?\d+/i,
];

const CONSTRAINT_SIGNALS = [
  /\bmust\b/i,
  /\bshould\b/i,
  /\brequire(d|ment)?\b/i,
  /\bwithin\b/i,
  /\bno more than\b/i,
  /\bunder\b/i,
  /\bdo not\b/i,
  /\bavoid\b/i,
  /\bonly\b/i,
  /\bexcept\b/i,
  /\bbackwards-?compat/i,
  /\bbreaking change/i,
];

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "openai_key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "anthropic_key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: "bearer_token", pattern: /\b[Bb]earer\s+[A-Za-z0-9._\-]{20,}\b/ },
  { name: "github_token", pattern: /\bghp_[A-Za-z0-9]{30,}\b/ },
  { name: "aws_key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "password_inline", pattern: /\bpassword\s*[:=]\s*\S{6,}/i },
];

const FILE_PATH_PATTERN = /[\w./_-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|md|yaml|yml|json|sql)\b/;
const CODE_FENCE_PATTERN = /```/;
const SYMBOL_PATTERN = /\b[A-Z][A-Za-z0-9]*(?:[._][A-Za-z0-9]+)+/;

const PHASE_KEYWORDS: Record<ProjectPhase, RegExp[]> = {
  requirements: [/\brequirement/i, /\bstory\b/i, /\bepic\b/i, /\bdraft\b/i, /\buser need/i],
  design: [/\bdesign\b/i, /\barchitecture\b/i, /\bADR\b/i, /\bdiagram\b/i, /\bschema\b/i],
  development: [/\bimplement/i, /\bcode\b/i, /\brefactor/i, /\bbuild\b/i, /\bfunction\b/i],
  testing: [/\btest\b/i, /\bcoverage\b/i, /\bcase\b/i, /\bassert/i, /\bfixture\b/i],
  cicd: [/\bdeploy\b/i, /\bpipeline\b/i, /\bCI\b/i, /\bCD\b/i, /\brelease\b/i],
  monitoring: [/\bmonitor/i, /\balert\b/i, /\bdashboard\b/i, /\bSLO\b/i, /\bincident\b/i],
};

const PHASE_MISMATCH_SIGNALS: Record<ProjectPhase, RegExp[]> = {
  requirements: [/\bimplement/i, /\brefactor/i, /\bdeploy\b/i],
  design: [/\bdeploy\b/i, /\bpush to prod/i],
  development: [/\bdeploy\b.*\bproduction\b/i, /\bpush to prod/i],
  testing: [/\bdeploy\b/i],
  cicd: [],
  monitoring: [/\bimplement new feature/i],
};

export interface DimensionScores {
  clarity: number;
  context: number;
  specificity: number;
  constraints: number;
  phaseFit: number;
  safety: number;
}

export interface PromptScore {
  overallScore: number;
  tier: PromptQualityTier;
  dimensions: DimensionScores;
  suggestions: string[];
  flags: string[];
  rubricVersion: string;
}

export interface PromptScoreInput {
  content: string;
  phase?: ProjectPhase | null;
  rules?: Array<{ kind: string; payload?: Record<string, unknown> }>;
}

/**
 * Score a prompt against the canonical 6-dimension rubric.
 *
 * Returns an integer overall score 0–100 and a tier:
 *   - 80–100 GOOD
 *   - 50–79  NEEDS_IMPROVEMENT
 *   - 0–49   POOR
 *
 * Deterministic: same input always produces byte-identical output for a
 * given rubric version.
 */
export function scorePromptQuality(input: PromptScoreInput): PromptScore {
  const content = (input.content ?? "").trim();
  const phase = input.phase ?? null;
  const suggestions: string[] = [];
  const flags: string[] = [];

  const dimensions: DimensionScores = {
    clarity: scoreClarity(content, suggestions, flags),
    context: scoreContext(content, suggestions),
    specificity: scoreSpecificity(content, suggestions),
    constraints: scoreConstraints(content, suggestions),
    phaseFit: scorePhaseFit(content, phase, suggestions, flags),
    safety: scoreSafety(content, flags),
  };

  // Equal-weight overall — simple and explainable. Future revisions may
  // weight; bump RUBRIC_VERSION to trigger rescore.
  const rawScore = Math.round(
    (dimensions.clarity +
      dimensions.context +
      dimensions.specificity +
      dimensions.constraints +
      dimensions.phaseFit +
      dimensions.safety) / 6,
  );

  // Safety is a gate, not a dimension to be averaged away. A prompt with
  // safety<50 (e.g. leaked secret) can otherwise score ~88 overall when the
  // other five dimensions are strong, since equal-weighting dilutes it.
  const overallScore = dimensions.safety < 50 ? Math.min(rawScore, 49) : rawScore;

  const tier: PromptQualityTier =
    overallScore >= 80 ? "GOOD" : overallScore >= 50 ? "NEEDS_IMPROVEMENT" : "POOR";

  return { overallScore, tier, dimensions, suggestions, flags, rubricVersion: RUBRIC_VERSION };
}

function scoreClarity(content: string, suggestions: string[], flags: string[]): number {
  if (!content) {
    suggestions.push("Empty prompt.");
    flags.push("empty");
    return 0;
  }
  // Check vague patterns before length — "fix it" matters more than its 6 chars.
  for (const re of VAGUE_PATTERNS) {
    if (re.test(content)) {
      suggestions.push("Replace vague pronouns (this/that/it) with the specific thing.");
      flags.push("vague_reference");
      return 30;
    }
  }
  if (content.length < 12) {
    suggestions.push("Prompt is very short — describe what you want done.");
    flags.push("too_short");
    return 20;
  }
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const hasActionVerb = ACTION_VERBS.some((v) =>
    new RegExp(`\\b${v}\\b`, "i").test(content),
  );
  if (!hasActionVerb) {
    suggestions.push("Lead with an action verb (add, fix, refactor, implement, …).");
    return 55;
  }
  if (wordCount < 6) return 65;
  if (wordCount < 12) return 80;
  return 95;
}

function scoreContext(content: string, suggestions: string[]): number {
  const hits = CONTEXT_SIGNALS.filter((re) => re.test(content)).length;
  const filePathHits = (content.match(new RegExp(FILE_PATH_PATTERN.source, "g")) ?? []).length;
  if (hits === 0 && filePathHits === 0) {
    suggestions.push("Add context: why are you doing this? Reference a file, PR, or issue.");
    return 20;
  }
  if (hits + filePathHits === 1) return 60;
  if (hits + filePathHits === 2) return 80;
  return 95;
}

function scoreSpecificity(content: string, suggestions: string[]): number {
  const filePathHits = FILE_PATH_PATTERN.test(content);
  const codeFence = CODE_FENCE_PATTERN.test(content);
  const symbol = SYMBOL_PATTERN.test(content);
  const hasNumbers = /\b\d+\b/.test(content);
  let score = 20;
  if (filePathHits) score += 35;
  if (codeFence) score += 25;
  if (symbol) score += 15;
  if (hasNumbers) score += 15;
  if (score < 60) {
    suggestions.push("Be specific: name a file, function, or paste a snippet.");
  }
  return Math.min(score, 100);
}

function scoreConstraints(content: string, suggestions: string[]): number {
  const hits = CONSTRAINT_SIGNALS.filter((re) => re.test(content)).length;
  if (hits === 0) {
    suggestions.push("Add constraints: what must / must NOT happen?");
    return 25;
  }
  if (hits === 1) return 70;
  return 90;
}

function scorePhaseFit(
  content: string,
  phase: ProjectPhase | null,
  suggestions: string[],
  flags: string[],
): number {
  if (!phase) return 60; // unknown phase — neutral-low
  const matches = PHASE_KEYWORDS[phase].some((re) => re.test(content));
  const mismatches = PHASE_MISMATCH_SIGNALS[phase].some((re) => re.test(content));
  if (mismatches) {
    suggestions.push(
      `This prompt looks like ${guessTargetPhase(content)} work; the project is in ${phase}. Consider advancing the phase or rescoping.`,
    );
    flags.push("phase_mismatch");
    return 35;
  }
  if (matches) return 95;
  return 70;
}

function scoreSafety(content: string, flags: string[]): number {
  let score = 100;
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      flags.push(`secret_pattern_detected:${name}`);
      score = Math.min(score, 30);
    }
  }
  return score;
}

function guessTargetPhase(content: string): ProjectPhase {
  for (const phase of Object.keys(PHASE_KEYWORDS) as ProjectPhase[]) {
    if (PHASE_KEYWORDS[phase].some((re) => re.test(content))) return phase;
  }
  return "development";
}

/** Formatted human-readable feedback string — used by the hook's `additionalContext`. */
export function formatScoreFeedback(score: PromptScore): string {
  const lines: string[] = [];
  lines.push(`Coznt prompt quality: ${score.overallScore} / 100 (${score.tier})`);
  const dims = score.dimensions;
  lines.push(
    `  clarity=${dims.clarity} context=${dims.context} specificity=${dims.specificity} constraints=${dims.constraints} phaseFit=${dims.phaseFit} safety=${dims.safety}`,
  );
  if (score.suggestions.length) {
    lines.push("Suggestions:");
    for (const s of score.suggestions) lines.push(`  • ${s}`);
  }
  if (score.flags.length) lines.push(`Flags: ${score.flags.join(", ")}`);
  return lines.join("\n");
}

export const __rubricInternals = {
  VAGUE_PATTERNS,
  ACTION_VERBS,
  CONTEXT_SIGNALS,
  CONSTRAINT_SIGNALS,
  SECRET_PATTERNS,
  PHASE_KEYWORDS,
  PHASE_MISMATCH_SIGNALS,
};
