const JIRA_PROJECT_KEY_RE = /^[A-Z][A-Z0-9_]*$/;

export function normalizeJiraProjectKey(projectKey: string): string {
  const key = projectKey.trim().toUpperCase();
  if (!JIRA_PROJECT_KEY_RE.test(key)) {
    throw new Error("Jira identifier must be a project key like ACME.");
  }
  return key;
}

export function jiraSiteKeyFromUrl(url?: string | null): string | null {
  const value = url?.trim();
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

export function jiraProjectKeyFromExternalKey(externalKey: string): string {
  const trimmed = externalKey.trim();
  const projectKey = trimmed.includes("/") ? trimmed.split("/").filter(Boolean).at(-1) : trimmed;
  return normalizeJiraProjectKey(projectKey ?? "");
}

export function jiraExternalKeyFromParts(projectKey: string, siteUrl?: string | null): string {
  const key = normalizeJiraProjectKey(projectKey);
  const siteKey = jiraSiteKeyFromUrl(siteUrl);
  return siteKey ? `${siteKey}/${key}` : key;
}

export function normalizeJiraExternalKey(
  externalKeyOrProjectKey: string,
  siteUrl?: string | null,
): string {
  const projectKey = jiraProjectKeyFromExternalKey(externalKeyOrProjectKey);
  if (siteUrl) return jiraExternalKeyFromParts(projectKey, siteUrl);
  const trimmed = externalKeyOrProjectKey.trim();
  const slash = trimmed.lastIndexOf("/");
  if (slash === -1) return projectKey;
  const sitePart = trimmed.slice(0, slash).trim();
  const site = jiraSiteKeyFromUrl(sitePart) ?? sitePart.toLowerCase();
  return site ? `${site}/${projectKey}` : projectKey;
}

export function jiraExternalKeyLookupCandidates(
  projectKey: string,
  siteUrl?: string | null,
): string[] {
  const candidates = [
    normalizeJiraExternalKey(projectKey, siteUrl),
    jiraProjectKeyFromExternalKey(projectKey),
  ];
  return [...new Set(candidates)];
}

export function jiraIssueBelongsToExternalKey(
  issueKey: string | null | undefined,
  externalKey: string | null | undefined,
): issueKey is string {
  if (!issueKey || !externalKey) return false;
  const projectKey = jiraProjectKeyFromExternalKey(externalKey);
  return issueKey.toUpperCase().startsWith(`${projectKey}-`);
}
