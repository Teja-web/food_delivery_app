/**
 * Shared ATS (Applicant Tracking System) provider interface.
 *
 * Follows the same registry pattern as calendar.ts and email.ts.
 * Borrows Panora's unify/desunify mapper concept: each provider maps
 * its native data shape to/from our unified models.
 *
 * Route handlers and actions import from here — never from a specific provider.
 */

import { db } from "@/db/client";
import { oauthConnections, integrationCredentials } from "@/db/schema/integrations";
import { eq, and } from "drizzle-orm";

// -- Unified types (provider-agnostic) -----------------------------------

export type ATSProvider = "greenhouse" | "lever" | "ashby" | "workable";

/** Unified candidate shape — what we store regardless of source ATS */
export interface ATSCandidate {
  remoteId: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  company?: string;
  location?: string;
  resumeUrl?: string;
  resumeText?: string;
  source?: string;
  tags?: string[];
  experience?: Array<{
    title: string;
    company: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  education?: Array<{
    institution: string;
    degree: string;
    field?: string;
    year?: number;
  }>;
  remoteData?: Record<string, unknown>;
}

/** Unified job/role shape */
export interface ATSJob {
  remoteId: string;
  title: string;
  department?: string;
  team?: string;
  location?: string;
  employmentType?: string;
  status: "open" | "draft" | "filled" | "cancelled";
  description?: string;
  hiringManagerEmail?: string;
  remoteData?: Record<string, unknown>;
}

/** Unified application shape */
export interface ATSApplication {
  remoteId: string;
  candidateRemoteId: string;
  jobRemoteId: string;
  status: string;
  stage?: string;
  appliedAt?: string;
  rejectedAt?: string;
  source?: string;
  remoteData?: Record<string, unknown>;
}

/** Result of a sync operation */
export interface ATSSyncResult<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
}

// -- Mapper interface (Panora-inspired unify/desunify) --------------------

/**
 * Each provider implements a mapper that converts between its native
 * API shape and our unified types. This is the key Panora pattern:
 * - unify():   provider data → our unified model (inbound sync)
 * - desunify(): our unified model → provider data (outbound push)
 */
export interface ATSMapper<TUnified, TRemote> {
  unify(remote: TRemote): TUnified;
  desunify(unified: TUnified): TRemote;
}

// -- Provider implementation interface ------------------------------------

export interface ATSProviderImpl {
  provider: ATSProvider;

  // Auth
  getAuthUrl(orgId: string): string | Promise<string>;
  exchangeCodeForTokens(code: string, orgId: string): Promise<string>;

  // Inbound sync — pull data from external ATS into Dilliznt
  syncCandidates(connectionId: string, cursor?: string): Promise<ATSSyncResult<ATSCandidate>>;
  syncJobs(connectionId: string, cursor?: string): Promise<ATSSyncResult<ATSJob>>;
  syncApplications(connectionId: string, cursor?: string): Promise<ATSSyncResult<ATSApplication>>;

  // Outbound push — send data from Dilliznt to external ATS
  pushCandidate?(connectionId: string, candidate: ATSCandidate): Promise<ATSCandidate>;
  pushApplication?(connectionId: string, application: ATSApplication): Promise<ATSApplication>;

  // Webhooks — process inbound webhook payloads from the ATS
  handleWebhook?(connectionId: string, payload: unknown): Promise<{
    type: "candidate" | "job" | "application";
    action: "created" | "updated" | "deleted";
    data: ATSCandidate | ATSJob | ATSApplication;
  } | null>;
}

// -- Provider registry ----------------------------------------------------

const providers = new Map<ATSProvider, ATSProviderImpl>();

export function registerATSProvider(impl: ATSProviderImpl) {
  providers.set(impl.provider, impl);
}

export function getATSProvider(provider: ATSProvider): ATSProviderImpl {
  const impl = providers.get(provider);
  if (!impl) throw new Error(`ATS provider "${provider}" is not registered`);
  return impl;
}

export function getRegisteredATSProviders(): ATSProvider[] {
  return Array.from(providers.keys());
}

// -- API key vs OAuth provider classification ----------------------------

const API_KEY_PROVIDERS: ATSProvider[] = ["greenhouse", "ashby"];
const OAUTH_PROVIDERS: ATSProvider[] = ["lever", "workable"];

// -- Provider-agnostic helpers --------------------------------------------

/**
 * Get the active ATS connection for an org.
 * Checks both integration_credentials (API key providers) and
 * oauth_connections (OAuth providers).
 */
export async function getOrgATSConnection(organizationId: string) {
  // Check OAuth connections first (Lever, Workable)
  const [oauthConn] = await db
    .select({
      id: oauthConnections.id,
      provider: oauthConnections.provider,
      accountEmail: oauthConnections.accountEmail,
      accountName: oauthConnections.accountName,
    })
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.organizationId, organizationId),
        eq(oauthConnections.category, "ats"),
        eq(oauthConnections.status, "active")
      )
    )
    .limit(1);

  if (oauthConn) {
    return { ...oauthConn, source: "connection" as const };
  }

  // Check API key credentials (Greenhouse, Ashby)
  const [credRow] = await db
    .select({
      id: integrationCredentials.id,
      provider: integrationCredentials.provider,
      config: integrationCredentials.config,
    })
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.organizationId, organizationId),
        eq(integrationCredentials.category, "ats"),
      )
    )
    .limit(1);

  if (credRow && credRow.provider && API_KEY_PROVIDERS.includes(credRow.provider as ATSProvider)) {
    return {
      id: credRow.id,
      provider: credRow.provider,
      accountEmail: null,
      accountName: credRow.provider.charAt(0).toUpperCase() + credRow.provider.slice(1),
      source: "credentials" as const,
    };
  }

  return null;
}

/**
 * Disconnect ATS. For OAuth providers, removes the connection (preserves credentials).
 * For API key providers, removes the credentials entirely.
 */
export async function disconnectATS(organizationId: string) {
  // Remove OAuth connections
  await db
    .delete(oauthConnections)
    .where(
      and(
        eq(oauthConnections.organizationId, organizationId),
        eq(oauthConnections.category, "ats")
      )
    );

  // Remove API key credentials
  await db
    .delete(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.organizationId, organizationId),
        eq(integrationCredentials.category, "ats")
      )
    );
}

/**
 * Full sync: paginate through all data from the connected ATS.
 * For API key providers, passes orgId directly.
 * For OAuth providers, passes the oauth_connections.id.
 */
export async function syncAllFromATS(organizationId: string) {
  const conn = await getOrgATSConnection(organizationId);
  if (!conn) return null;

  const impl = providers.get(conn.provider as ATSProvider);
  if (!impl) return null;

  // API key providers use orgId; OAuth providers use connectionId
  const syncId = conn.source === "credentials" ? organizationId : conn.id;

  const candidates: ATSCandidate[] = [];
  const jobs: ATSJob[] = [];
  const applications: ATSApplication[] = [];

  let cursor: string | undefined;
  do {
    const result = await impl.syncCandidates(syncId, cursor);
    candidates.push(...result.items);
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  cursor = undefined;
  do {
    const result = await impl.syncJobs(syncId, cursor);
    jobs.push(...result.items);
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  cursor = undefined;
  do {
    const result = await impl.syncApplications(syncId, cursor);
    applications.push(...result.items);
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  return { candidates, jobs, applications };
}
