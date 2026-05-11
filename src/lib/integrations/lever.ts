/**
 * Lever ATS provider implementation.
 *
 * Key Lever API traits (learned from Nango integration-templates):
 * - OAuth 2.0 auth
 * - Lever's "candidate" equivalent is an "opportunity" (candidate in a pipeline)
 * - Jobs are called "postings"
 * - Applications are sub-resources of opportunities
 * - Cursor-based pagination via { next, hasNext } in response body
 * - Incremental sync via created_at_start timestamp
 *
 * Ref: https://hire.lever.co/developer/documentation
 */

import { db } from "@/db/client";
import { oauthConnections } from "@/db/schema/integrations";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { decrypt, encrypt } from "./encryption";
import { getProviderCredentials } from "./credentials";
import {
  registerATSProvider,
  type ATSCandidate,
  type ATSJob,
  type ATSApplication,
  type ATSMapper,
  type ATSProviderImpl,
  type ATSSyncResult,
} from "./ats";

// -- Lever-specific types (raw API shapes) --------------------------------

interface LeverOpportunity {
  id: string;
  name: string;
  headline: string;
  contact: string;
  emails: string[];
  phones: Array<{ value: string; type: string }>;
  location: string;
  links: string[];
  archived: { reason: string; archivedAt: number } | null;
  createdAt: number;
  updatedAt: number;
  lastInteractionAt: number;
  stage: string;
  stageChanges: Array<{ toStageId: string; updatedAt: number }>;
  owner: string;
  tags: string[];
  sources: string[];
  origin: string;
  sourcedBy: string;
  applications: string[];
  resume: string | null;
  urls: { list: string; show: string };
  isAnonymized: boolean;
  opportunityLocation: string;
}

interface LeverPosting {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  user: string;
  owner: string;
  hiringManager: string;
  categories: {
    team: string;
    department: string;
    location: string;
    allLocations: string[];
    commitment: string;
    level: string;
  };
  content: {
    description: string;
    descriptionHtml: string;
    lists: Array<{ text: string; content: string }>;
    closing: string;
    closingHtml: string;
  };
  country: string;
  tags: string[];
  state: string;
  reqCode: string;
  salaryRange: { max: number; min: number; currency: string; interval: string } | null;
  urls: { list: string; show: string; apply: string };
  workplaceType: string;
}

interface LeverApplication {
  id: string;
  opportunityId: string;
  candidateId: string;
  createdAt: number;
  type: string;
  posting: string;
  postingHiringManager: string;
  postingOwner: string;
  user: string;
  name: string;
  email: string;
  phone: { type: string; value: string } | null;
  company: string;
  links: string[];
  archived: { reason: string; archivedAt: number } | null;
}

interface LeverListResponse<T> {
  data: T[];
  hasNext: boolean;
  next?: string;
}

// -- Mappers --------------------------------------------------------------

const candidateMapper: ATSMapper<ATSCandidate, LeverOpportunity> = {
  unify(opp): ATSCandidate {
    return {
      remoteId: opp.id,
      name: opp.name,
      email: opp.emails?.[0] ?? "",
      phone: opp.phones?.[0]?.value,
      title: opp.headline || undefined,
      location: opp.location || opp.opportunityLocation || undefined,
      source: opp.sources?.[0] ?? opp.origin ?? "lever",
      tags: opp.tags ?? [],
      remoteData: opp as unknown as Record<string, unknown>,
    };
  },

  desunify(candidate): LeverOpportunity {
    return {
      id: candidate.remoteId,
      name: candidate.name,
      headline: candidate.title ?? "",
      contact: candidate.remoteId,
      emails: candidate.email ? [candidate.email] : [],
      phones: candidate.phone ? [{ value: candidate.phone, type: "mobile" }] : [],
      location: candidate.location ?? "",
      links: [],
      archived: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastInteractionAt: Date.now(),
      stage: "",
      stageChanges: [],
      owner: "",
      tags: candidate.tags ?? [],
      sources: candidate.source ? [candidate.source] : [],
      origin: "applied",
      sourcedBy: "",
      applications: [],
      resume: null,
      urls: { list: "", show: "" },
      isAnonymized: false,
      opportunityLocation: candidate.location ?? "",
    };
  },
};

const jobMapper: ATSMapper<ATSJob, LeverPosting> = {
  unify(posting): ATSJob {
    const statusMap: Record<string, ATSJob["status"]> = {
      published: "open",
      internal: "open",
      closed: "cancelled",
      draft: "draft",
      pending: "draft",
    };

    return {
      remoteId: posting.id,
      title: posting.text,
      department: posting.categories?.department || undefined,
      team: posting.categories?.team || undefined,
      location: posting.categories?.location || undefined,
      employmentType: posting.categories?.commitment || undefined,
      status: statusMap[posting.state] ?? "open",
      description: posting.content?.description,
      remoteData: posting as unknown as Record<string, unknown>,
    };
  },

  desunify(job): LeverPosting {
    return {
      id: job.remoteId,
      text: job.title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      user: "",
      owner: "",
      hiringManager: "",
      categories: {
        team: job.team ?? "",
        department: job.department ?? "",
        location: job.location ?? "",
        allLocations: [],
        commitment: job.employmentType ?? "",
        level: "",
      },
      content: {
        description: job.description ?? "",
        descriptionHtml: "",
        lists: [],
        closing: "",
        closingHtml: "",
      },
      country: "",
      tags: [],
      state: (job.status === "filled" || job.status === "cancelled") ? "closed" : job.status === "draft" ? "draft" : "published",
      reqCode: "",
      salaryRange: null,
      urls: { list: "", show: "", apply: "" },
      workplaceType: "",
    };
  },
};

const applicationMapper: ATSMapper<ATSApplication, LeverApplication> = {
  unify(app): ATSApplication {
    return {
      remoteId: app.id,
      candidateRemoteId: app.opportunityId,
      jobRemoteId: app.posting ?? "",
      status: app.archived ? "rejected" : "active",
      appliedAt: app.createdAt ? new Date(app.createdAt).toISOString() : undefined,
      rejectedAt: app.archived?.archivedAt ? new Date(app.archived.archivedAt).toISOString() : undefined,
      source: app.type,
      remoteData: app as unknown as Record<string, unknown>,
    };
  },

  desunify(app): LeverApplication {
    return {
      id: app.remoteId,
      opportunityId: app.candidateRemoteId,
      candidateId: app.candidateRemoteId,
      createdAt: app.appliedAt ? new Date(app.appliedAt).getTime() : Date.now(),
      type: app.source ?? "referral",
      posting: app.jobRemoteId,
      postingHiringManager: "",
      postingOwner: "",
      user: "",
      name: "",
      email: "",
      phone: null,
      company: "",
      links: [],
      archived: null,
    };
  },
};

// -- Auth helpers ---------------------------------------------------------

const LEVER_API_BASE = "https://api.lever.co/v1";
const LEVER_AUTH_BASE = "https://auth.lever.co/authorize";
const LEVER_TOKEN_URL = "https://auth.lever.co/oauth/token";

async function getAccessToken(connectionId: string): Promise<string> {
  const [conn] = await db
    .select({
      accessTokenEncrypted: oauthConnections.accessTokenEncrypted,
      refreshTokenEncrypted: oauthConnections.refreshTokenEncrypted,
      tokenExpiresAt: oauthConnections.tokenExpiresAt,
      organizationId: oauthConnections.organizationId,
    })
    .from(oauthConnections)
    .where(eq(oauthConnections.id, connectionId))
    .limit(1);

  if (!conn) throw new Error("Lever connection not found");

  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
  if (expiresAt && expiresAt < new Date() && conn.refreshTokenEncrypted) {
    const creds = await getProviderCredentials(conn.organizationId, "lever");
    if (creds.type !== "oauth") throw new Error("Lever requires OAuth credentials");

    const refreshToken = decrypt(conn.refreshTokenEncrypted);
    const res = await fetch(LEVER_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) throw new Error("Failed to refresh Lever token");
    const tokens = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };

    await db.update(oauthConnections).set({
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : conn.refreshTokenEncrypted,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }).where(eq(oauthConnections.id, connectionId));

    return tokens.access_token;
  }

  return decrypt(conn.accessTokenEncrypted);
}

async function leverFetch<T>(connectionId: string, path: string, params?: Record<string, string>): Promise<LeverListResponse<T>> {
  const token = await getAccessToken(connectionId);
  const url = new URL(`${LEVER_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Lever API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<LeverListResponse<T>>;
}

// -- Provider implementation ----------------------------------------------

const leverProvider: ATSProviderImpl = {
  provider: "lever",

  async getAuthUrl(orgId: string): Promise<string> {
    const creds = await getProviderCredentials(orgId, "lever");
    if (creds.type !== "oauth") throw new Error("Lever requires OAuth credentials");

    const state = Buffer.from(JSON.stringify({ orgId, provider: "lever" })).toString("base64");
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: creds.redirectUri,
      response_type: "code",
      scope: "offline_access candidates:read:admin opportunities:read:admin postings:read:admin applications:read:admin",
      state,
    });
    return `${LEVER_AUTH_BASE}?${params.toString()}`;
  },

  async exchangeCodeForTokens(code: string, orgId: string): Promise<string> {
    const creds = await getProviderCredentials(orgId, "lever");
    if (creds.type !== "oauth") throw new Error("Lever requires OAuth credentials");

    const res = await fetch(LEVER_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: creds.redirectUri,
        code,
      }),
    });

    if (!res.ok) throw new Error("Failed to exchange Lever auth code");
    const tokens = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };

    const id = nanoid();
    await db.insert(oauthConnections).values({
      id,
      organizationId: orgId,
      userId: "system",
      provider: "lever",
      category: "ats",
      status: "active",
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      accountName: "Lever",
    });

    return id;
  },

  async syncCandidates(connectionId: string, cursor?: string): Promise<ATSSyncResult<ATSCandidate>> {
    const params: Record<string, string> = { limit: "100" };
    if (cursor) params.offset = cursor;

    const res = await leverFetch<LeverOpportunity>(connectionId, "/opportunities", params);
    return {
      items: res.data.map((o) => candidateMapper.unify(o)),
      cursor: res.next,
      hasMore: res.hasNext,
    };
  },

  async syncJobs(connectionId: string, cursor?: string): Promise<ATSSyncResult<ATSJob>> {
    const params: Record<string, string> = { limit: "100" };
    if (cursor) params.offset = cursor;

    const res = await leverFetch<LeverPosting>(connectionId, "/postings", params);
    return {
      items: res.data.map((p) => jobMapper.unify(p)),
      cursor: res.next,
      hasMore: res.hasNext,
    };
  },

  async syncApplications(connectionId: string, cursor?: string): Promise<ATSSyncResult<ATSApplication>> {
    // Lever applications are sub-resources of opportunities.
    // First fetch a page of opportunities, then fetch their applications.
    const params: Record<string, string> = { limit: "100" };
    if (cursor) params.offset = cursor;

    const oppRes = await leverFetch<LeverOpportunity>(connectionId, "/opportunities", params);
    const applications: ATSApplication[] = [];

    for (const opp of oppRes.data) {
      const appRes = await leverFetch<LeverApplication>(
        connectionId,
        `/opportunities/${opp.id}/applications`,
      );
      applications.push(...appRes.data.map((a) => applicationMapper.unify(a)));
    }

    return {
      items: applications,
      cursor: oppRes.next,
      hasMore: oppRes.hasNext,
    };
  },

  async pushCandidate(connectionId: string, candidate: ATSCandidate): Promise<ATSCandidate> {
    const token = await getAccessToken(connectionId);
    const body = {
      name: candidate.name,
      headline: candidate.title ?? "",
      emails: candidate.email ? [candidate.email] : [],
      phones: candidate.phone ? [{ value: candidate.phone, type: "mobile" }] : [],
      tags: candidate.tags ?? [],
      sources: candidate.source ? [candidate.source] : [],
      origin: "applied",
    };

    const res = await fetch(`${LEVER_API_BASE}/opportunities`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Lever push candidate error: ${res.status}`);
    const { data } = (await res.json()) as { data: LeverOpportunity };
    return candidateMapper.unify(data);
  },

  async handleWebhook(_connectionId: string, payload: unknown) {
    const event = payload as {
      event: string;
      triggeredAt: number;
      data: { opportunityId?: string; candidateId?: string; [key: string]: unknown };
    };

    // Lever webhooks use event names like "candidateHired", "candidateStageChange", etc.
    if (event.data?.opportunityId) {
      return {
        type: "candidate" as const,
        action: "updated" as const,
        data: {
          remoteId: event.data.opportunityId as string,
          name: "",
          email: "",
          remoteData: event.data as Record<string, unknown>,
        } as ATSCandidate,
      };
    }

    return null;
  },
};

// -- Register on import ---------------------------------------------------

registerATSProvider(leverProvider);
