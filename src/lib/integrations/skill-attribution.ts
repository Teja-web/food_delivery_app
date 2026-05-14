/**
 * Parse the originating skill slug out of commit messages or a PR body.
 *
 * Convention (matches ai-sdlc-framework's "Made-with: Cursor" / coznt's
 * fixture data):
 *   Made-by: <skill-slug>
 *   coznt-skill: <skill-slug>      (alternative)
 *
 * Multiple commits may carry trailers; we take the *latest* (first commit
 * iterated should be the head commit). If commits disagree we use the head
 * commit's trailer. Returns null if no trailer is found.
 */

const TRAILER_PATTERNS = [/^made-by:\s*([a-z0-9][a-z0-9-]*)\s*$/im, /^coznt-skill:\s*([a-z0-9][a-z0-9-]*)\s*$/im];

export function parseSkillSlug(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const pattern of TRAILER_PATTERNS) {
    const m = pattern.exec(text);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

export interface CommitLike {
  message: string;
  sha?: string;
}

/**
 * Best-attribution from an ordered list of commits (head first). Falls
 * back to the PR body if no trailer is found in any commit.
 */
export function attributeSkill(commits: CommitLike[], prBody: string | null | undefined): string | null {
  for (const c of commits) {
    const slug = parseSkillSlug(c.message);
    if (slug) return slug;
  }
  return parseSkillSlug(prBody);
}
