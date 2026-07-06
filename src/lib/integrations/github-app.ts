/**
 * GitHub App auth — JWT for app-level requests, installation-scoped
 * tokens for `checks: write` calls.
 *
 * Env (set when the org installs the coznt GitHub App):
 *   COZNT_GITHUB_APP_ID
 *   COZNT_GITHUB_APP_PRIVATE_KEY  (PEM, can contain literal "\n")
 *
 * When either is unset, `isConfigured()` returns false and callers
 * persist the verdict without POSTing a check-run. That keeps the gate
 * end-to-end demoable before the GitHub App is registered.
 */

import { createSign } from "node:crypto";

interface InstallationTokenResp {
  token: string;
  expires_at: string;
}

let installationTokenCache: { token: string; expiresAt: number; installationId: string } | null = null;

export function isConfigured(): boolean {
  return Boolean(process.env.COZNT_GITHUB_APP_ID) && Boolean(process.env.COZNT_GITHUB_APP_PRIVATE_KEY);
}

function privateKey(): string {
  const raw = process.env.COZNT_GITHUB_APP_PRIVATE_KEY ?? "";
  // Allow "\n" literals so the key fits in a single env var.
  return raw.replace(/\\n/g, "\n");
}

/** App-level JWT, valid 10 minutes. Used to mint installation tokens. */
function mintAppJwt(): string {
  const appId = process.env.COZNT_GITHUB_APP_ID!;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: now - 30, exp: now + 9 * 60, iss: appId }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = signer.sign(privateKey()).toString("base64url");
  return `${signingInput}.${signature}`;
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export async function installationTokenFor(installationId: string): Promise<string> {
  const now = Date.now();
  if (
    installationTokenCache &&
    installationTokenCache.installationId === installationId &&
    installationTokenCache.expiresAt - now > 60_000
  ) {
    return installationTokenCache.token;
  }
  const jwt = mintAppJwt();
  const res = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`Installation token failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as InstallationTokenResp;
  installationTokenCache = {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
    installationId,
  };
  return data.token;
}

export interface CheckRunInput {
  installationId: string;
  ownerRepo: string;
  headSha: string;
  name: string;
  conclusion: "success" | "failure" | "neutral";
  title: string;
  summary: string;
  text?: string;
  detailsUrl?: string;
}

/**
 * Fetch the repository tree at a given ref, returning the full path list. Used
 * by the merge-webhook sync tasks to enumerate `.agents/**\/*.md` files. The
 * `recursive=1` flag returns all paths in one call (up to GitHub's tree limit).
 *
 * Returns `null` when the GitHub App isn't configured — callers degrade
 * gracefully so the merge-webhook still records the event.
 */
export async function listRepoTree(input: {
  installationId: string;
  ownerRepo: string;
  ref: string;
}): Promise<{ paths: string[]; truncated: boolean } | null> {
  if (!isConfigured()) return null;
  const token = await installationTokenFor(input.installationId);
  const res = await fetch(
    `https://api.github.com/repos/${input.ownerRepo}/git/trees/${encodeURIComponent(input.ref)}?recursive=1`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return { paths: [], truncated: false };
  if (!res.ok) {
    throw new Error(`Tree fetch failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as {
    tree: Array<{ path: string; type: string }>;
    truncated: boolean;
  };
  const paths = body.tree.filter((e) => e.type === "blob").map((e) => e.path);
  return { paths, truncated: body.truncated };
}

/**
 * Fetch a single file's raw contents at a ref. Used by the sync tasks to
 * read individual `.agents/**\/*.md` files identified via `listRepoTree`.
 * Returns null on 404 (file may have been removed in the merge).
 */
export async function fetchFileContent(input: {
  installationId: string;
  ownerRepo: string;
  ref: string;
  path: string;
}): Promise<string | null> {
  if (!isConfigured()) return null;
  const token = await installationTokenFor(input.installationId);
  const res = await fetch(
    `https://api.github.com/repos/${input.ownerRepo}/contents/${encodeURI(input.path)}?ref=${encodeURIComponent(input.ref)}`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.raw",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`File fetch failed (${res.status}): ${await res.text()}`);
  }
  return await res.text();
}

/**
 * Resolve the GitHub App installationId for an owner/repo. The merge-webhook
 * payload already carries it for events on the repo; this helper exists for
 * cron-style tasks (e.g. resync-on-demand) that don't have a webhook payload
 * in hand.
 */
export async function findInstallationForRepo(ownerRepo: string): Promise<string | null> {
  if (!isConfigured()) return null;
  const jwt = mintAppJwt();
  const res = await fetch(`https://api.github.com/repos/${ownerRepo}/installation`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Installation lookup failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { id: number };
  return String(body.id);
}

/**
 * List the files changed in a pull request. Used by §9 PR-lifecycle status
 * derivation to narrow file-claimed plans to those actually touched by the PR.
 */
export async function listFilesForPr(input: {
  installationId: string;
  ownerRepo: string;
  pullNumber: number;
}): Promise<string[]> {
  if (!isConfigured()) return [];
  const token = await installationTokenFor(input.installationId);
  const out: string[] = [];
  let page = 1;
  for (;;) {
    const res = await fetch(
      `https://api.github.com/repos/${input.ownerRepo}/pulls/${input.pullNumber}/files?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!res.ok) {
      throw new Error(`PR files fetch failed (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as Array<{ filename: string }>;
    out.push(...body.map((f) => f.filename));
    if (body.length < 100) break;
    page += 1;
    if (page > 30) break; // hard cap; PRs with >3000 files are abnormal
  }
  return out;
}

export interface PullRequestFileWithPatch {
  sha: string | null;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
  previousFilename: string | null;
}

/**
 * List changed PR files with patch text. Used by Coznt Cat V1 to summarize
 * pull requests without adding a new GitHub writeback surface.
 */
export async function listPullRequestFilesWithPatches(input: {
  installationId: string;
  ownerRepo: string;
  pullNumber: number;
  maxPages?: number;
}): Promise<PullRequestFileWithPatch[]> {
  if (!isConfigured()) return [];
  const token = await installationTokenFor(input.installationId);
  const out: PullRequestFileWithPatch[] = [];
  const maxPages = input.maxPages ?? 10;
  let page = 1;
  for (;;) {
    const res = await fetch(
      `https://api.github.com/repos/${input.ownerRepo}/pulls/${input.pullNumber}/files?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!res.ok) {
      throw new Error(`PR files fetch failed (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as Array<{
      sha?: string;
      filename: string;
      status: string;
      additions?: number;
      deletions?: number;
      changes?: number;
      patch?: string;
      previous_filename?: string;
    }>;
    out.push(
      ...body.map((file) => ({
        sha: file.sha ?? null,
        filename: file.filename,
        status: file.status,
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
        changes: file.changes ?? 0,
        patch: file.patch ?? null,
        previousFilename: file.previous_filename ?? null,
      })),
    );
    if (body.length < 100) break;
    page += 1;
    if (page > maxPages) break;
  }
  return out;
}

/**
 * List comments on a pull request. Used by the merge-webhook to find
 * `coznt:approve <slug>` pre-approval markers per spec §13.
 */
export async function listPullRequestComments(input: {
  installationId: string;
  ownerRepo: string;
  pullNumber: number;
}): Promise<Array<{ author: string; body: string }>> {
  if (!isConfigured()) return [];
  const token = await installationTokenFor(input.installationId);
  const res = await fetch(
    `https://api.github.com/repos/${input.ownerRepo}/issues/${input.pullNumber}/comments?per_page=100`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`PR comment fetch failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as Array<{ user: { login: string }; body: string }>;
  return body.map((c) => ({ author: c.user?.login ?? "unknown", body: c.body ?? "" }));
}

/**
 * Resolve the commit SHA at the tip of a branch. Used by `propose_artifact`
 * to pick the base SHA before branching. Returns null on 404.
 */
export async function getBranchSha(input: {
  installationId: string;
  ownerRepo: string;
  branch: string;
}): Promise<string | null> {
  if (!isConfigured()) return null;
  const token = await installationTokenFor(input.installationId);
  const res = await fetch(
    `https://api.github.com/repos/${input.ownerRepo}/git/refs/heads/${encodeURIComponent(input.branch)}`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Ref lookup failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { object: { sha: string } };
  return body.object.sha;
}

/**
 * Create a new branch ref at the given SHA. Returns false if the branch
 * already exists (422), true on creation.
 */
export async function createBranchRef(input: {
  installationId: string;
  ownerRepo: string;
  newBranch: string;
  fromSha: string;
}): Promise<boolean> {
  if (!isConfigured()) return false;
  const token = await installationTokenFor(input.installationId);
  const res = await fetch(`https://api.github.com/repos/${input.ownerRepo}/git/refs`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: `refs/heads/${input.newBranch}`,
      sha: input.fromSha,
    }),
  });
  if (res.status === 422) return false;
  if (!res.ok) {
    throw new Error(`Branch create failed (${res.status}): ${await res.text()}`);
  }
  return true;
}

/**
 * Create or update a file on a branch via the Contents API. The Contents API
 * requires the current SHA when updating; we GET first to look it up. For
 * `propose_artifact` we're typically writing new files on a fresh branch, so
 * the GET 404s and we skip the SHA — but we handle the update case for
 * idempotency on retried calls.
 */
export async function putFileContent(input: {
  installationId: string;
  ownerRepo: string;
  branch: string;
  path: string;
  content: string;
  message: string;
}): Promise<void> {
  if (!isConfigured()) return;
  const token = await installationTokenFor(input.installationId);

  let existingSha: string | undefined;
  const head = await fetch(
    `https://api.github.com/repos/${input.ownerRepo}/contents/${encodeURI(input.path)}?ref=${encodeURIComponent(input.branch)}`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (head.ok) {
    const headBody = (await head.json()) as { sha?: string };
    existingSha = headBody.sha;
  } else if (head.status !== 404) {
    throw new Error(`Contents lookup failed (${head.status}): ${await head.text()}`);
  }

  const res = await fetch(
    `https://api.github.com/repos/${input.ownerRepo}/contents/${encodeURI(input.path)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: input.message,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        branch: input.branch,
        sha: existingSha,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`File PUT failed (${res.status}, ${input.path}): ${await res.text()}`);
  }
}

/**
 * Open a pull request. Used by `propose_artifact` MCP verb (§Example 2 in
 * dev-authoring-examples.md) to push AI-authored skill/plan files for human
 * review. Returns null when GitHub App isn't configured.
 */
export async function createPullRequest(input: {
  installationId: string;
  ownerRepo: string;
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
}): Promise<{ number: number; url: string } | null> {
  if (!isConfigured()) return null;
  const token = await installationTokenFor(input.installationId);
  const res = await fetch(`https://api.github.com/repos/${input.ownerRepo}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.headBranch,
      base: input.baseBranch,
    }),
  });
  if (!res.ok) {
    throw new Error(`PR open failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { number: number; html_url: string };
  return { number: body.number, url: body.html_url };
}

export async function postCheckRun(input: CheckRunInput): Promise<{ id: number } | null> {
  if (!isConfigured()) return null;
  const token = await installationTokenFor(input.installationId);
  const res = await fetch(`https://api.github.com/repos/${input.ownerRepo}/check-runs`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.name,
      head_sha: input.headSha,
      status: "completed",
      conclusion: input.conclusion,
      details_url: input.detailsUrl,
      output: {
        title: input.title,
        summary: input.summary,
        text: input.text,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Check-run POST failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { id: number };
  return { id: body.id };
}
