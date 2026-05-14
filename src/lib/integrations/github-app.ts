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
