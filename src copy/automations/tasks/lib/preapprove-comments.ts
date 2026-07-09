/**
 * Parse `coznt:approve <slug>` PR-comment pre-approvals per
 * docs/spec/dev-authoring-surface.md §13. Org-tier admins can pre-approve in
 * the PR via review comments, so the merge auto-applies without a follow-up
 * step.
 *
 * The matcher is intentionally narrow — comment must START with
 * `coznt:approve` (after optional leading whitespace / blockquote prefix).
 * Trailing text after the slug is ignored, so admins can write
 * `coznt:approve foo (looks good)` and the rationale is captured.
 */

const APPROVE_LINE_RE = /^\s*(?:>\s*)?coznt:approve\s+([a-z0-9][a-z0-9-]*)\b(.*)$/im;

export interface ParsedApproval {
  slug: string;
  rationale: string;
  /** Author of the PR comment as reported by GitHub. */
  author: string;
}

export function parseApprovalComments(
  comments: Array<{ author: string; body: string }>,
): ParsedApproval[] {
  const out: ParsedApproval[] = [];
  for (const c of comments) {
    for (const line of (c.body ?? "").split("\n")) {
      const match = line.match(APPROVE_LINE_RE);
      if (!match) continue;
      out.push({
        slug: match[1],
        rationale: match[2].trim().replace(/^[(\[]\s*|\s*[)\]]$/g, "") || "",
        author: c.author,
      });
    }
  }
  return out;
}
