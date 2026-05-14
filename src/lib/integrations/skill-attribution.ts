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

/**
 * Fetch a commit's message via the GitHub REST API and parse the skill
 * trailer. Used for outcome assessors that have a SHA but no PR (e.g.
 * deploy events: the commit they deployed carries the attribution).
 *
 * Requires the GitHub App to be configured. Returns null on any error or
 * when the installation token isn't reachable — callers fall back to an
 * unattributed (null skill) outcome.
 */
export async function attributeSkillFromCommitSha(
  sha: string,
  ownerRepo: string,
  installationId: string,
): Promise<string | null> {
  if (!sha || !ownerRepo || !installationId) return null;
  const { isConfigured, installationTokenFor } = await import("./github-app");
  if (!isConfigured()) return null;
  try {
    const token = await installationTokenFor(installationId);
    const res = await fetch(
      `https://api.github.com/repos/${ownerRepo}/commits/${encodeURIComponent(sha)}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { commit?: { message?: string } };
    return parseSkillSlug(data.commit?.message ?? null);
  } catch {
    return null;
  }
}

/**
 * Detect a revert and identify the original SHA. Returns:
 *   - `sha`  — the SHA of the commit being reverted (from "This reverts commit X")
 *   - `title` — quoted title from `Revert "..."` (for matching when SHA is absent)
 *
 * GitHub's UI generates revert PRs with both. Either one alone is usable.
 */
export interface RevertSignal {
  /** SHA of the original commit being reverted, if extractable. */
  originalSha: string | null;
  /** Quoted title from `Revert "..."`, if present. */
  originalTitle: string | null;
}

const REVERT_TITLE_RE = /^revert\s+"(.+?)"/i;
const REVERTS_COMMIT_RE = /this reverts commit\s+([0-9a-f]{7,40})/i;

export function detectRevert(
  title: string | null | undefined,
  body: string | null | undefined,
): RevertSignal | null {
  const titleMatch = title ? REVERT_TITLE_RE.exec(title) : null;
  const bodyMatch = body ? REVERTS_COMMIT_RE.exec(body) : null;
  if (!titleMatch && !bodyMatch) return null;
  return {
    originalSha: bodyMatch ? bodyMatch[1] : null,
    originalTitle: titleMatch ? titleMatch[1] : null,
  };
}
