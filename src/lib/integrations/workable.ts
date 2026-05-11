/**
 * Workable ATS provider implementation.
 *
 * Key Workable API traits (learned from Nango integration-templates):
 * - OAuth 2.0 auth (or API access token)
 * - Pagination via paging.next URL in response body
 * - Candidates, jobs, members as primary entities
 * - Jobs use "shortcode" as identifier in URLs
 * - Rich candidate data with education_entries, experience_entries, skills
 *
 * Ref: https://workable.readme.io/reference
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

// -- Workable-specific types (raw API shapes) -----------------------------

interface WorkableCandidate {
  id: string;
  name: string;
  firstname: string;
  lastname: string;
  headline: string;
  account: { subdomain: string; name: string };
  job: { shortcode: string; title: string };
  stage: string;
  disqualified: boolean;
  disqualification_reason: string | null;
  hired_at: string | null;
  sourced: boolean;
  profile_url: string;
  address: string;
  phone: string;
  email: string;
  domain: string;
  created_at: string;
  updated_at: string;
  // Extended fields (from detail endpoint)
  resume_url?: string;
  cover_letter?: string;
  summary?: string;
  tags?: string[];
  skills?: string[];
  education_entries?: Array<{
    school: string;
    degree: string;
    field_of_study: string;
    start_date: string;
    end_date: string;
  }>;
  experience_entries?: Array<{
    title: string;
    summary: string;
    start_date: string;
    end_date: string;
    current: boolean;
    company: string;
    industry: string;
  }>;
  location?: {
    location_str: string;
    country: string;
    country_code: string;
    region: string;
    city: string;
    zip_code: string;
  };
}

interface WorkableJob {
  id: string;
  title: string;
  full_title: string;
  shortcode: string;
  code: string;
  state: string;
  sample: boolean;
  department: string;
  department_hierarchy: unknown[];
  url: string;
  application_url: string;
  shortlink: string;
  location: {
    location_str: string;
    country: string;
    country_code: string;
    region: string;
    city: string;
    zip_code: string;
    telecommuting: boolean;
    workplace_type: string;
  };
  locations: unknown[];
  salary: { salary_from: number; salary_to: number; salary_currency: string } | null;
  created_at: string;
}

interface WorkablePaginatedResponse<T> {
  candidates?: T[];
  jobs?: T[];
  paging?: { next?: string };
}

// -- Mappers --------------------------------------------------------------

const candidateMapper: ATSMapper<ATSCandidate, WorkableCandidate> = {
  unify(wk): ATSCandidate {
    return {
      remoteId: wk.id,
      name: wk.name,
      email: wk.email ?? "",
      phone: wk.phone || undefined,
      title: wk.headline || undefined,
      company: wk.domain || undefined,
      location: wk.address || wk.location?.location_str || undefined,
      resumeUrl: wk.resume_url || undefined,
      source: wk.sourced ? "sourced" : "applied",
      tags: wk.tags ?? wk.skills ?? [],
      experience: wk.experience_entries?.map((e) => ({
        title: e.title,
        company: e.company,
        startDate: e.start_date || undefined,
        endDate: e.end_date || undefined,
        description: e.summary || undefined,
      })),
      education: wk.education_entries?.map((e) => ({
        institution: e.school,
        degree: e.degree,
        field: e.field_of_study || undefined,
      })),
      remoteData: wk as unknown as Record<string, unknown>,
    };
  },

  desunify(candidate): WorkableCandidate {
    const [firstname = "", ...rest] = candidate.name.split(" ");
    return {
      id: candidate.remoteId,
      name: candidate.name,
      firstname,
      lastname: rest.join(" "),
      headline: candidate.title ?? "",
      account: { subdomain: "", name: "" },
      job: { shortcode: "", title: "" },
      stage: "",
      disqualified: false,
      disqualification_reason: null,
      hired_at: null,
      sourced: false,
      profile_url: "",
      address: candidate.location ?? "",
      phone: candidate.phone ?? "",
      email: candidate.email,
      domain: candidate.company ?? "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tags: candidate.tags,
    };
  },
};

const jobMapper: ATSMapper<ATSJob, WorkableJob> = {
  unify(wk): ATSJob {
    const statusMap: Record<string, ATSJob["status"]> = {
      published: "open",
      draft: "draft",
      closed: "cancelled",
      archived: "cancelled",
    };

    return {
      remoteId: wk.id,
      title: wk.title,
      department: wk.department || undefined,
      location: wk.location?.telecommuting
        ? "Remote"
        : wk.location?.location_str || undefined,
      employmentType: wk.location?.workplace_type || undefined,
      status: statusMap[wk.state] ?? "open",
      remoteData: wk as unknown as Record<string, unknown>,
    };
  },

  desunify(job): WorkableJob {
    return {
      id: job.remoteId,
      title: job.title,
      full_title: job.title,
      shortcode: "",
      code: "",
      state: (job.status === "filled" || job.status === "cancelled") ? "closed" : job.status === "draft" ? "draft" : "published",
      sample: false,
      department: job.department ?? "",
      department_hierarchy: [],
      url: "",
      application_url: "",
      shortlink: "",
      location: {
        location_str: job.location ?? "",
        country: "",
        country_code: "",
        region: "",
        city: "",
        zip_code: "",
        telecommuting: false,
        workplace_type: job.employmentType ?? "",
      },
      locations: [],
      salary: null,
      created_at: new Date().toISOString(),
    };
  },
};

// -- Auth helpers ---------------------------------------------------------

const WORKABLE_API_BASE = "https://www.workable.com/spi/v3";
const WORKABLE_AUTH_URL = "https://www.workable.com/oauth/authorize";
const WORKABLE_TOKEN_URL = "https://www.workable.com/oauth/token";

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

  if (!conn) throw new Error("Workable connection not found");

  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
  if (expiresAt && expiresAt < new Date() && conn.refreshTokenEncrypted) {
    const creds = await getProviderCredentials(conn.organizationId, "workable");
    if (creds.type !== "oauth") throw new Error("Workable requires OAuth credentials");

    const refreshToken = decrypt(conn.refreshTokenEncrypted);
    const res = await fetch(WORKABLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) throw new Error("Failed to refresh Workable token");
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

async function workableFetch<T>(connectionId: string, path: string, params?: Record<string, string>): Promise<{ items: T[]; nextUrl?: string }> {
  const token = await getAccessToken(connectionId);
  const url = new URL(`${WORKABLE_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) throw new Error(`Workable API error: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as WorkablePaginatedResponse<T>;

  // Workable puts items under entity-specific keys
  const items = (body.candidates ?? body.jobs ?? []) as T[];
  return { items, nextUrl: body.paging?.next };
}

// -- Provider implementation ----------------------------------------------

const workableProvider: ATSProviderImpl = {
  provider: "workable",

  async getAuthUrl(orgId: string): Promise<string> {
    const creds = await getProviderCredentials(orgId, "workable");
    if (creds.type !== "oauth") throw new Error("Workable requires OAuth credentials");

    const state = Buffer.from(JSON.stringify({ orgId, provider: "workable" })).toString("base64");
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: creds.redirectUri,
      response_type: "code",
      scope: "r_candidates r_jobs",
      state,
    });
    return `${WORKABLE_AUTH_URL}?${params.toString()}`;
  },

  async exchangeCodeForTokens(code: string, orgId: string): Promise<string> {
    const creds = await getProviderCredentials(orgId, "workable");
    if (creds.type !== "oauth") throw new Error("Workable requires OAuth credentials");

    const res = await fetch(WORKABLE_TOKEN_URL, {
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

    if (!res.ok) throw new Error("Failed to exchange Workable auth code");
    const tokens = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };

    const id = nanoid();
    await db.insert(oauthConnections).values({
      id,
      organizationId: orgId,
      userId: "system",
      provider: "workable",
      category: "ats",
      status: "active",
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      accountName: "Workable",
    });

    return id;
  },

  async syncCandidates(connectionId: string, cursor?: string): Promise<ATSSyncResult<ATSCandidate>> {
    const params: Record<string, string> = { limit: "100" };

    // Workable uses full URL for next page, but we encode just the path+query as cursor
    let result: { items: WorkableCandidate[]; nextUrl?: string };
    if (cursor) {
      // cursor is the full next URL from paging.next
      const token = await getAccessToken(connectionId);
      const res = await fetch(cursor, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Workable API error: ${res.status}`);
      const body = (await res.json()) as WorkablePaginatedResponse<WorkableCandidate>;
      result = { items: body.candidates ?? [], nextUrl: body.paging?.next };
    } else {
      result = await workableFetch<WorkableCandidate>(connectionId, "/candidates", params);
    }

    return {
      items: result.items.map((c) => candidateMapper.unify(c)),
      cursor: result.nextUrl,
      hasMore: !!result.nextUrl,
    };
  },

  async syncJobs(connectionId: string, cursor?: string): Promise<ATSSyncResult<ATSJob>> {
    const params: Record<string, string> = { limit: "100" };

    let result: { items: WorkableJob[]; nextUrl?: string };
    if (cursor) {
      const token = await getAccessToken(connectionId);
      const res = await fetch(cursor, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Workable API error: ${res.status}`);
      const body = (await res.json()) as WorkablePaginatedResponse<WorkableJob>;
      result = { items: body.jobs ?? [], nextUrl: body.paging?.next };
    } else {
      result = await workableFetch<WorkableJob>(connectionId, "/jobs", params);
    }

    return {
      items: result.items.map((j) => jobMapper.unify(j)),
      cursor: result.nextUrl,
      hasMore: !!result.nextUrl,
    };
  },

  async syncApplications(_connectionId: string, _cursor?: string): Promise<ATSSyncResult<ATSApplication>> {
    // Workable candidates are inherently tied to jobs (each candidate has a job.shortcode).
    // The candidate sync already captures the job association.
    // A dedicated application sync would need to iterate jobs → candidates per job.
    // For now, applications are derived from candidate data.
    return { items: [], hasMore: false };
  },

  async pushCandidate(connectionId: string, candidate: ATSCandidate): Promise<ATSCandidate> {
    const token = await getAccessToken(connectionId);
    const [firstname = "", ...rest] = candidate.name.split(" ");

    // Workable requires a job shortcode to create a candidate
    // The shortcode should be provided via remoteData or a default
    const shortcode = (candidate.remoteData?.jobShortcode as string) ?? "";
    if (!shortcode) throw new Error("Workable requires a job shortcode to create a candidate");

    const body = {
      sourced: true,
      candidate: {
        name: candidate.name,
        firstname,
        lastname: rest.join(" "),
        email: candidate.email,
        headline: candidate.title ?? "",
        address: candidate.location ?? "",
        phone: candidate.phone ?? "",
        tags: candidate.tags ?? [],
        education_entries: (candidate.education ?? []).map((e) => ({
          school: e.institution,
          degree: e.degree,
          field_of_study: e.field ?? "",
          start_date: "",
          end_date: "",
        })),
        experience_entries: (candidate.experience ?? []).map((e) => ({
          title: e.title,
          company: e.company,
          summary: e.description ?? "",
          start_date: e.startDate ?? "",
          end_date: e.endDate ?? "",
          current: false,
          industry: "",
        })),
      },
    };

    const res = await fetch(`${WORKABLE_API_BASE}/jobs/${shortcode}/candidates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Workable push candidate error: ${res.status}`);
    const { candidate: created } = (await res.json()) as { status: string; candidate: WorkableCandidate };
    return candidateMapper.unify(created);
  },
};

// -- Register on import ---------------------------------------------------

registerATSProvider(workableProvider);
