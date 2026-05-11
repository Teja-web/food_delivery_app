/**
 * Ashby ATS provider implementation.
 *
 * Key Ashby API traits (learned from Nango integration-templates):
 * - All API endpoints are POST (even reads)
 * - Cursor-based pagination with { moreDataAvailable, nextCursor }
 * - Incremental sync via syncToken (returned in responses, passed in next request)
 * - API key auth (Basic auth with API key as username, empty password)
 *
 * Ref: https://developers.ashbyhq.com/reference
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

// -- Ashby-specific types (raw API shapes) --------------------------------

interface AshbyCandidate {
  id: string;
  createdAt: string;
  name: string;
  primaryEmailAddress: { value: string; type: string; isPrimary: boolean } | null;
  emailAddresses: Array<{ value: string; type: string; isPrimary: boolean }>;
  primaryPhoneNumber: { value: string; type: string; isPrimary: boolean } | null;
  phoneNumbers: Array<{ value: string; type: string; isPrimary: boolean }>;
  socialLinks: Array<{ type: string; url: string }>;
  tags: Array<{ id: string; title: string; isArchived: boolean }>;
  position: string | null;
  company: string | null;
  school: string | null;
  applicationIds: string[];
  resumeFileHandle: { id: string; name: string; handle: string } | null;
  fileHandles: Array<{ id: string; name: string; handle: string }>;
  customFields: unknown[];
  profileUrl: string;
  source: {
    id: string;
    title: string;
    isArchived: boolean;
    sourceType: { id: string; title: string; isArchived: boolean };
  } | null;
  creditedToUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

interface AshbyJob {
  id: string;
  title: string;
  confidential: boolean;
  status: string;
  employmentType: string;
  locationId: string;
  departmentId: string;
  defaultInterviewPlanId: string;
  interviewPlanIds: string[];
  customFields: unknown[];
  jobPostingIds: string[];
  customRequisitionId: string;
  hiringTeam: Array<{
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    userId: string;
  }>;
  updatedAt: string;
  location: {
    id: string;
    name: string;
    isArchived: boolean;
    address: {
      postalAddress: {
        addressCountry: string;
        addressRegion: string;
        addressLocality: string;
      };
    };
    isRemote: boolean;
  } | null;
  openings: string[];
}

interface AshbyListResponse<T> {
  success: boolean;
  errors?: string[];
  results: T[];
  moreDataAvailable: boolean;
  nextCursor?: string;
  syncToken?: string;
}

// -- Mappers --------------------------------------------------------------

const candidateMapper: ATSMapper<ATSCandidate, AshbyCandidate> = {
  unify(ashby): ATSCandidate {
    const linkedIn = ashby.socialLinks?.find((l) => l.type === "LinkedIn");

    return {
      remoteId: ashby.id,
      name: ashby.name,
      email: ashby.primaryEmailAddress?.value ?? ashby.emailAddresses?.[0]?.value ?? "",
      phone: ashby.primaryPhoneNumber?.value ?? ashby.phoneNumbers?.[0]?.value,
      title: ashby.position ?? undefined,
      company: ashby.company ?? undefined,
      source: ashby.source?.title ?? "ashby",
      tags: ashby.tags?.map((t) => t.title) ?? [],
      resumeUrl: ashby.resumeFileHandle
        ? `https://app.ashbyhq.com/api/file/${ashby.resumeFileHandle.handle}`
        : undefined,
      remoteData: ashby as unknown as Record<string, unknown>,
    };
  },

  desunify(candidate): AshbyCandidate {
    return {
      id: candidate.remoteId,
      createdAt: new Date().toISOString(),
      name: candidate.name,
      primaryEmailAddress: candidate.email
        ? { value: candidate.email, type: "personal", isPrimary: true }
        : null,
      emailAddresses: candidate.email
        ? [{ value: candidate.email, type: "personal", isPrimary: true }]
        : [],
      primaryPhoneNumber: candidate.phone
        ? { value: candidate.phone, type: "mobile", isPrimary: true }
        : null,
      phoneNumbers: candidate.phone
        ? [{ value: candidate.phone, type: "mobile", isPrimary: true }]
        : [],
      socialLinks: [],
      tags: (candidate.tags ?? []).map((t) => ({ id: "", title: t, isArchived: false })),
      position: candidate.title ?? null,
      company: candidate.company ?? null,
      school: null,
      applicationIds: [],
      resumeFileHandle: null,
      fileHandles: [],
      customFields: [],
      profileUrl: "",
      source: null,
      creditedToUser: null,
    };
  },
};

const jobMapper: ATSMapper<ATSJob, AshbyJob> = {
  unify(ashby): ATSJob {
    const statusMap: Record<string, ATSJob["status"]> = {
      Open: "open",
      Closed: "cancelled",
      Draft: "draft",
      Archived: "cancelled",
    };

    const hiringManager = ashby.hiringTeam?.find((m) => m.role === "Hiring Manager");
    const locationName = ashby.location?.isRemote
      ? "Remote"
      : ashby.location?.name ?? undefined;

    return {
      remoteId: ashby.id,
      title: ashby.title,
      location: locationName,
      employmentType: ashby.employmentType || undefined,
      status: statusMap[ashby.status] ?? "open",
      hiringManagerEmail: hiringManager?.email,
      remoteData: ashby as unknown as Record<string, unknown>,
    };
  },

  desunify(job): AshbyJob {
    return {
      id: job.remoteId,
      title: job.title,
      confidential: false,
      status: (job.status === "filled" || job.status === "cancelled") ? "Closed" : job.status === "draft" ? "Draft" : "Open",
      employmentType: job.employmentType ?? "",
      locationId: "",
      departmentId: "",
      defaultInterviewPlanId: "",
      interviewPlanIds: [],
      customFields: [],
      jobPostingIds: [],
      customRequisitionId: "",
      hiringTeam: [],
      updatedAt: new Date().toISOString(),
      location: null,
      openings: [],
    };
  },
};

// -- Auth helpers ---------------------------------------------------------

const ASHBY_API_BASE = "https://api.ashbyhq.com";

async function getApiKey(orgId: string): Promise<string> {
  const creds = await getProviderCredentials(orgId, "ashby");
  if (creds.type !== "api_key") throw new Error("Ashby requires API key credentials");
  return creds.apiKey;
}

async function ashbyPost<T>(orgId: string, endpoint: string, data: Record<string, unknown> = {}): Promise<T> {
  const apiKey = await getApiKey(orgId);
  const res = await fetch(`${ASHBY_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`Ashby API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// -- Provider implementation ----------------------------------------------

const ashbyProvider: ATSProviderImpl = {
  provider: "ashby",

  getAuthUrl(orgId: string): string {
    return `/recruit/settings/integrations`;
  },

  async exchangeCodeForTokens(_code: string, _orgId: string): Promise<string> {
    throw new Error("Ashby uses API key auth. Configure via Settings > Integrations.");
  },

  async syncCandidates(orgId: string, cursor?: string): Promise<ATSSyncResult<ATSCandidate>> {
    const data: Record<string, unknown> = { limit: 100 };
    if (cursor) data.cursor = cursor;

    const response = await ashbyPost<AshbyListResponse<AshbyCandidate>>(
      orgId,
      "/candidate.list",
      data,
    );

    if (!response.success) {
      throw new Error(`Ashby sync error: ${response.errors?.join(", ") ?? "unknown"}`);
    }

    return {
      items: response.results.map((c) => candidateMapper.unify(c)),
      cursor: response.nextCursor,
      hasMore: response.moreDataAvailable,
    };
  },

  async syncJobs(orgId: string, cursor?: string): Promise<ATSSyncResult<ATSJob>> {
    const data: Record<string, unknown> = { limit: 100 };
    if (cursor) data.cursor = cursor;

    const response = await ashbyPost<AshbyListResponse<AshbyJob>>(
      orgId,
      "/job.list",
      data,
    );

    if (!response.success) {
      throw new Error(`Ashby sync error: ${response.errors?.join(", ") ?? "unknown"}`);
    }

    return {
      items: response.results.map((j) => jobMapper.unify(j)),
      cursor: response.nextCursor,
      hasMore: response.moreDataAvailable,
    };
  },

  async syncApplications(_orgId: string, _cursor?: string): Promise<ATSSyncResult<ATSApplication>> {
    return { items: [], hasMore: false };
  },

  async pushCandidate(orgId: string, candidate: ATSCandidate): Promise<ATSCandidate> {
    const data: Record<string, unknown> = {
      name: candidate.name,
      email: candidate.email || undefined,
      phoneNumber: candidate.phone || undefined,
    };

    const response = await ashbyPost<{ success: boolean; results: AshbyCandidate; errors?: string[] }>(
      orgId,
      "/candidate.create",
      data,
    );

    if (!response.success) {
      throw new Error(`Ashby create candidate error: ${response.errors?.join(", ") ?? "unknown"}`);
    }

    return candidateMapper.unify(response.results);
  },

  async handleWebhook(_orgId: string, payload: unknown) {
    // Ashby webhooks: https://developers.ashbyhq.com/reference/webhooks
    const event = payload as {
      action: string;
      objectType: string;
      data: { id: string; [key: string]: unknown };
    };

    if (event.objectType === "Candidate") {
      return {
        type: "candidate" as const,
        action: (event.action === "created" ? "created" : event.action === "deleted" ? "deleted" : "updated") as "created" | "updated" | "deleted",
        data: candidateMapper.unify(event.data as unknown as AshbyCandidate),
      };
    }

    if (event.objectType === "Job") {
      return {
        type: "job" as const,
        action: "updated" as const,
        data: jobMapper.unify(event.data as unknown as AshbyJob),
      };
    }

    return null;
  },
};

// -- Register on import ---------------------------------------------------

registerATSProvider(ashbyProvider);
