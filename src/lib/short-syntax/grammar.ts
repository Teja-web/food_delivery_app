/**
 * Short-syntax grammar — minimal tokens, fixed at M-C.
 *
 *   #kind                  — Plan kind (#spec, #story, #adr, ...)
 *   +project-slug          — project binding (3+ chars, prefix-match)
 *   @assignee | @ISO-date  — assignee (alphanumeric) OR due date (YYYY-MM-DD)
 *   →approval:<target>     — approval routing (target = role or username)
 *                            `->approval:` is accepted as ASCII fallback
 *   2h / 3d / 30m          — estimate (minutes, hours, days)
 *
 * Per Decision §6: per-Plan-kind toggles and org-vocab extension are cut as
 * speculative complexity. Ship one grammar; expand only on real demand.
 *
 * Per super-productivity convention: a space is required before sigil
 * tokens (`#`, `+`, `@`). `Task#urgent` does NOT parse `#urgent`.
 */

/** Token kinds the parser recognises. Order matters for try-each precedence. */
export const TOKEN_PATTERNS = {
  kind: /(?:^|\s)#([a-z][a-z_]*)/gi,
  project: /(?:^|\s)\+([a-z0-9][a-z0-9-]{2,})/gi,
  dueDate: /(?:^|\s)@(\d{4}-\d{2}-\d{2})\b/g,
  assignee: /(?:^|\s)@([a-z0-9][a-z0-9_.-]*)/gi,
  approval: /(?:^|\s)(?:→|->)approval:([a-z0-9][a-z0-9_.@-]*)/gi,
  estimate: /(?:^|\s)(\d+(?:\.\d+)?)([mhd])\b/gi,
} as const;

export type TokenName = keyof typeof TOKEN_PATTERNS;

/** Minutes per estimate unit. */
export const ESTIMATE_UNIT_MINUTES = {
  m: 1,
  h: 60,
  d: 60 * 8, // working day, not calendar day — matches productivity-tool convention
} as const;

export type EstimateUnit = keyof typeof ESTIMATE_UNIT_MINUTES;
