/**
 * Short-syntax parser.
 *
 * Pure function — no DB, no Drizzle. Importable from the MCP CLI bundle
 * (slim), the platform server, and the web quick-add palette.
 *
 * Strategy: each token has a global regex with a leading boundary
 * (`(?:^|\s)`). We sweep all token patterns over the input, collect
 * matches with their absolute positions, then strip them from the input
 * to leave the prose title.
 *
 * Disambiguation rules:
 *   - `@YYYY-MM-DD` is a due date; any other `@…` is an assignee. The
 *     `dueDate` pattern is tried first; the assignee pattern is anchored
 *     to start with a non-digit-only sequence so a date is not also
 *     captured as an assignee.
 *   - When the same token kind appears twice, the *last* occurrence wins.
 *   - Tokens with no leading space (e.g. `Task#urgent`) are not parsed
 *     and stay in the title.
 */

import {
  ESTIMATE_UNIT_MINUTES,
  TOKEN_PATTERNS,
  type EstimateUnit,
  type TokenName,
} from "./grammar.js";

export interface ParseResult {
  /** Prose left after stripping recognised tokens. Trimmed of doubled whitespace. */
  title: string;
  /** Plan kind from `#kind`. */
  kind?: string;
  /** Project slug from `+slug`. */
  projectSlug?: string;
  /** Assignee handle from `@user` (when not an ISO date). */
  assignee?: string;
  /** Due date from `@YYYY-MM-DD`. Returned as ISO date string (caller parses). */
  dueDate?: string;
  /** Approval target from `→approval:target` or `->approval:target`. */
  approvalTarget?: string;
  /** Estimate in minutes — sum across all `Nm`/`Nh`/`Nd` tokens. */
  estimateMinutes?: number;
}

interface Match {
  token: TokenName;
  start: number;
  end: number;
  capture: string;
  /** For estimate tokens only. */
  unit?: EstimateUnit;
}

export function parseShortSyntax(input: string): ParseResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { title: "" };

  const matches: Match[] = [];
  for (const [token, regex] of Object.entries(TOKEN_PATTERNS) as Array<[TokenName, RegExp]>) {
    // Reset regex.lastIndex since we share globals across calls.
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(trimmed)) !== null) {
      const fullMatch = m[0];
      // The leading boundary `(?:^|\s)` either includes a space char or is
      // empty (start of string). Strip the space so token-strip is exact.
      const leadingOffset = fullMatch.startsWith(" ") ? 1 : 0;
      matches.push({
        token,
        start: m.index + leadingOffset,
        end: m.index + fullMatch.length,
        capture: m[1],
        unit: token === "estimate" ? (m[2] as EstimateUnit) : undefined,
      });
    }
  }

  // Resolve the @… ambiguity: any assignee match overlapping a dueDate match
  // is dropped (the date wins).
  const dueDateRanges = matches.filter((m) => m.token === "dueDate");
  const resolved = matches.filter(
    (m) =>
      m.token !== "assignee" ||
      !dueDateRanges.some((d) => d.start <= m.start && m.start < d.end),
  );

  // Apply token values; later-occurring wins for single-valued fields.
  const result: ParseResult = { title: "" };
  let estimateMinutes = 0;
  resolved.sort((a, b) => a.start - b.start);
  for (const m of resolved) {
    switch (m.token) {
      case "kind":
        result.kind = m.capture.toLowerCase();
        break;
      case "project":
        result.projectSlug = m.capture.toLowerCase();
        break;
      case "dueDate":
        result.dueDate = m.capture;
        break;
      case "assignee":
        result.assignee = m.capture.toLowerCase();
        break;
      case "approval":
        result.approvalTarget = m.capture.toLowerCase();
        break;
      case "estimate": {
        const value = Number.parseFloat(m.capture);
        if (Number.isFinite(value) && m.unit) {
          estimateMinutes += value * ESTIMATE_UNIT_MINUTES[m.unit];
        }
        break;
      }
    }
  }
  if (estimateMinutes > 0) result.estimateMinutes = Math.round(estimateMinutes);

  // Strip matched ranges (in reverse so indices stay valid) and collapse
  // whitespace.
  let stripped = trimmed;
  const sorted = [...resolved].sort((a, b) => b.start - a.start);
  for (const m of sorted) {
    stripped = stripped.slice(0, m.start) + stripped.slice(m.end);
  }
  result.title = stripped.replace(/\s+/g, " ").trim();
  return result;
}
