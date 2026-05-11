/**
 * Integration client factories — credential-loading wrappers.
 *
 * Lifted from /Users/ram/Projects/SDLC/packages/integrations/src/. Each
 * `getXClient(orgId)` reads `integration_credentials`, decrypts secrets,
 * and returns a ready-to-use client.
 *
 * GitHub uses `@octokit/rest` (install before first use). Jira / ADO /
 * Confluence are zero-dep (raw fetch).
 */

import { JiraClient } from "./jira";
import { AzureDevOpsClient } from "./azure-devops";
import { ConfluenceClient } from "./confluence";
import { loadCredentials } from "../credentials";

export { JiraClient, AzureDevOpsClient, ConfluenceClient };
export type { GitHubClient } from "./github";

interface JiraConfig {
  baseUrl: string;
  email: string;
}

interface AdoConfig {
  orgUrl: string;
}

interface ConfluenceConfig {
  baseUrl: string;
  email: string;
}

export async function getGitHubClient(organizationId: string) {
  const creds = await loadCredentials(organizationId, "github");
  if (!creds.apiKey) {
    throw new Error("GitHub integration requires apiKey (a PAT or installation token)");
  }
  // Lazy import — keeps `@octokit/rest` optional until the client is actually used.
  const { GitHubClient } = await import("./github");
  return new GitHubClient(creds.apiKey);
}

export async function getJiraClient(organizationId: string): Promise<JiraClient> {
  const creds = await loadCredentials(organizationId, "jira");
  const { baseUrl, email } = creds.config as Partial<JiraConfig>;
  if (!baseUrl || !email || !creds.apiKey) {
    throw new Error("Jira integration requires config.baseUrl, config.email, and apiKey");
  }
  return new JiraClient(baseUrl, email, creds.apiKey);
}

export async function getAdoClient(organizationId: string): Promise<AzureDevOpsClient> {
  const creds = await loadCredentials(organizationId, "ado");
  const { orgUrl } = creds.config as Partial<AdoConfig>;
  if (!orgUrl || !creds.apiKey) {
    throw new Error("Azure DevOps integration requires config.orgUrl and apiKey (PAT)");
  }
  return new AzureDevOpsClient(orgUrl, creds.apiKey);
}

export async function getConfluenceClient(organizationId: string): Promise<ConfluenceClient> {
  const creds = await loadCredentials(organizationId, "confluence");
  const { baseUrl, email } = creds.config as Partial<ConfluenceConfig>;
  if (!baseUrl || !email || !creds.apiKey) {
    throw new Error("Confluence integration requires config.baseUrl, config.email, and apiKey");
  }
  return new ConfluenceClient(baseUrl, email, creds.apiKey);
}
