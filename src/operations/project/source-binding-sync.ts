import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adapterBindings, type AdapterProvider } from "@/db/schema/adapter-binding";
import { repositories, type RepositorySource } from "@/db/schema/repository";
import { canonicalizeRemote } from "@/domain/git-remote";

interface NormalizeInput {
  source: RepositorySource;
  identifier: string;
  url?: string | null;
}

export interface NormalizedRepositoryInput {
  source: RepositorySource;
  identifier: string;
  url: string | null;
  externalKey: string;
}

interface ParsedGitHub {
  host: string;
  owner: string;
  repo: string;
}

const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const ADO_KEY_RE = /^[^/\s]+\/[^/\s]+$/;
const CONFLUENCE_KEY_RE = /^[A-Z][A-Z0-9_]*$/;

export function normalizeRepositoryInput(input: NormalizeInput): NormalizedRepositoryInput {
  const source = input.source;
  const identifierRaw = input.identifier.trim();
  const urlRaw = input.url?.trim() ?? "";
  const url = urlRaw || null;

  if (!identifierRaw) {
    throw new Error("Identifier is required.");
  }

  switch (source) {
    case "github": {
      const parsed = parseGitHub(identifierRaw, url);
      const identifier = `${parsed.owner}/${parsed.repo}`;
      const externalKey = `${parsed.host}/${identifier}`;
      return { source, identifier, url, externalKey };
    }
    case "jira": {
      const identifier = identifierRaw.toUpperCase();
      if (!JIRA_KEY_RE.test(identifier)) {
        throw new Error("Jira identifier must be a project key like ACME.");
      }
      return { source, identifier, url, externalKey: identifier };
    }
    case "ado": {
      const identifier = identifierRaw.replace(/^\/+|\/+$/g, "");
      if (!ADO_KEY_RE.test(identifier)) {
        throw new Error("Azure DevOps identifier must be organization/project.");
      }
      return { source, identifier, url, externalKey: identifier.toLowerCase() };
    }
    case "confluence": {
      const identifier = identifierRaw.toUpperCase();
      if (!CONFLUENCE_KEY_RE.test(identifier)) {
        throw new Error("Confluence identifier must be a space key like ENG.");
      }
      return { source, identifier, url, externalKey: identifier };
    }
  }
}

function parseGitHub(identifier: string, url: string | null): ParsedGitHub {
  const fromIdentifier = parseGitHubCandidate(identifier);
  const fromUrl = url ? parseGitHubCandidate(url) : null;

  if (fromIdentifier && fromUrl) {
    const a = `${fromIdentifier.host}/${fromIdentifier.owner}/${fromIdentifier.repo}`;
    const b = `${fromUrl.host}/${fromUrl.owner}/${fromUrl.repo}`;
    if (a !== b) {
      throw new Error("GitHub identifier and URL refer to different repositories.");
    }
  }

  const parsed = fromIdentifier ?? fromUrl;
  if (!parsed) {
    throw new Error(
      "GitHub identifier must be owner/repo, host/owner/repo, or a valid GitHub repo URL.",
    );
  }
  return parsed;
}

function parseGitHubCandidate(value: string): ParsedGitHub | null {
  const v = value.trim();
  if (!v) return null;

  // owner/repo (common UI input)
  const two = v.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (two) {
    return { host: "github.com", owner: two[1], repo: stripGitSuffix(two[2]) };
  }

  // host/owner/repo or URL/SSH variants canonicalized into host/path form.
  const canonical = canonicalizeRemote(v);
  const parts = canonical.split("/").filter(Boolean);
  if (parts.length !== 3) return null;
  const [hostRaw, owner, repoRaw] = parts;
  const host = hostRaw.toLowerCase() === "www.github.com" ? "github.com" : hostRaw.toLowerCase();
  const repo = stripGitSuffix(repoRaw);
  if (!host || !owner || !repo) return null;
  return { host, owner, repo };
}

function stripGitSuffix(name: string): string {
  return name.replace(/\.git$/i, "");
}

function sourceToProvider(source: RepositorySource): AdapterProvider {
  return source;
}

interface SyncUpsertInput {
  organizationId: string;
  projectId: string;
  source: RepositorySource;
  externalKey: string;
}

export async function ensureAdapterBinding(input: SyncUpsertInput): Promise<void> {
  const provider = sourceToProvider(input.source);
  const existing = await db.query.adapterBindings.findFirst({
    where: and(
      eq(adapterBindings.organizationId, input.organizationId),
      eq(adapterBindings.provider, provider),
      eq(adapterBindings.externalKey, input.externalKey),
    ),
    columns: { projectId: true },
  });

  if (existing && existing.projectId !== input.projectId) {
    throw new Error(
      `This ${input.source} source is already bound to another project in this workspace.`,
    );
  }
  if (existing) return;

  await db.insert(adapterBindings).values({
    organizationId: input.organizationId,
    projectId: input.projectId,
    provider,
    externalKey: input.externalKey,
  });
}

interface SyncDeleteInput {
  organizationId: string;
  projectId: string;
  source: RepositorySource;
  externalKey: string;
}

export async function removeAdapterBindingIfUnused(input: SyncDeleteInput): Promise<void> {
  const provider = sourceToProvider(input.source);
  const rows = await db
    .select({
      source: repositories.source,
      identifier: repositories.identifier,
      url: repositories.url,
    })
    .from(repositories)
    .where(
      and(
        eq(repositories.organizationId, input.organizationId),
        eq(repositories.projectId, input.projectId),
        eq(repositories.source, input.source),
      ),
    );

  const stillUsed = rows.some((row) => {
    try {
      return (
        normalizeRepositoryInput({
          source: row.source,
          identifier: row.identifier,
          url: row.url,
        }).externalKey === input.externalKey
      );
    } catch {
      return false;
    }
  });
  if (stillUsed) return;

  await db
    .delete(adapterBindings)
    .where(
      and(
        eq(adapterBindings.organizationId, input.organizationId),
        eq(adapterBindings.projectId, input.projectId),
        eq(adapterBindings.provider, provider),
        eq(adapterBindings.externalKey, input.externalKey),
      ),
    );
}
