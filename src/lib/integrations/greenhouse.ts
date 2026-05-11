/**
 * Greenhouse ATS provider implementation.
 *
 * Demonstrates the mapper pattern borrowed from Panora:
 * - Raw Greenhouse API types defined locally
 * - Mapper converts between Greenhouse shapes and our unified ATSCandidate/ATSJob/ATSApplication
 * - Provider impl handles auth + API calls + pagination
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

// -- Greenhouse-specific types (raw API shapes) ---------------------------

interface GreenhouseCandidate {
  id: number;
  first_name: string;
  last_name: string;
  company: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
  last_activity: string | null;
  is_private: boolean;
  photo_url: string | null;
  attachments: Array<{ filename: string; url: string; type: string }>;
  application_ids: number[];
  phone_numbers: Array<{ value: string; type: string }>;
  addresses: Array<{ value: string; type: string }>;
  email_addresses: Array<{ value: string; type: string }>;
  website_addresses: Array<{ value: string; type: string }>;
  social_media_addresses: Array<{ value: string; type: string }>;
  recruiter: { id: number; first_name: string; last_name: string; name: string; employee_id: string } | null;
  coordinator: { id: number; first_name: string; last_name: string; name: string; employee_id: string } | null;
  can_email: boolean;
  tags: string[];
  applications: number[];
  educations: Array<{
    school_name: string;
    degree: string;
    discipline: string;
    start_date: string | null;
    end_date: string | null;
  }>;
  employments: Array<{
    company_name: string;
    title: string;
    start_date: string | null;
    end_date: string | null;
  }>;
  custom_fields: Record<string, unknown>;
  keyed_custom_fields: Record<string, unknown>;
}

interface GreenhouseJob {
  id: number;
  name: string;
  requisition_id: string | null;
  notes: string | null;
  confidential: boolean;
  status: string;
  created_at: string;
  opened_at: string | null;
  closed_at: string | null;
  updated_at: string;
  is_template: boolean;
  departments: Array<{ id: number; name: string }>;
  offices: Array<{ id: number; name: string; location: { name: string } }>;
  custom_fields: Record<string, unknown>;
  keyed_custom_fields: Record<string, unknown>;
  hiring_team: {
    hiring_managers: Array<{ id: number; first_name: string; last_name: string; name: string; employee_id: string }>;
    recruiters: Array<{ id: number; first_name: string; last_name: string; name: string; employee_id: string }>;
    coordinators: Array<{ id: number; first_name: string; last_name: string; name: string; employee_id: string }>;
  };
  openings: Array<{ id: number; status: string }>;
}

interface GreenhouseApplication {
  id: number;
  candidate_id: number;
  prospect: boolean;
  applied_at: string;
  rejected_at: string | null;
  last_activity_at: string | null;
  location: { address: string } | null;
  source: { id: number; public_name: string } | null;
  credited_to: { id: number; first_name: string; last_name: string; name: string } | null;
  rejection_reason: { id: number; name: string } | null;
  jobs: Array<{ id: number; name: string }>;
  job_post_id: number | null;
  status: string;
  current_stage: { id: number; name: string } | null;
  custom_fields: Record<string, unknown>;
  keyed_custom_fields: Record<string, unknown>;
  attachments: unknown[];
}

// -- Mappers (Panora-inspired unify/desunify) -----------------------------

const candidateMapper: ATSMapper<ATSCandidate, GreenhouseCandidate> = {
  unify(gh): ATSCandidate {
    const primaryEmail = gh.email_addresses?.find((e) => e.type === "personal") ?? gh.email_addresses?.[0];
    const primaryPhone = gh.phone_numbers?.find((p) => p.type === "mobile") ?? gh.phone_numbers?.[0];
    const resume = gh.attachments?.find((a) => a.type === "resume");

    return {
      remoteId: String(gh.id),
      name: `${gh.first_name} ${gh.last_name}`.trim(),
      email: primaryEmail?.value ?? "",
      phone: primaryPhone?.value,
      title: gh.title ?? undefined,
      company: gh.company ?? undefined,
      location: gh.addresses?.[0]?.value,
      resumeUrl: resume?.url,
      source: "greenhouse",
      tags: gh.tags ?? [],
      experience: gh.employments?.map((e) => ({
        title: e.title,
        company: e.company_name,
        startDate: e.start_date ?? undefined,
        endDate: e.end_date ?? undefined,
      })) ?? [],
      education: gh.educations?.map((e) => ({
        institution: e.school_name,
        degree: e.degree,
        field: e.discipline || undefined,
      })) ?? [],
      remoteData: gh as unknown as Record<string, unknown>,
    };
  },

  desunify(candidate): GreenhouseCandidate {
    const [firstName = "", ...rest] = candidate.name.split(" ");
    return {
      id: Number(candidate.remoteId) || 0,
      first_name: firstName,
      last_name: rest.join(" "),
      company: candidate.company ?? null,
      title: candidate.title ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_activity: null,
      is_private: false,
      photo_url: null,
      attachments: candidate.resumeUrl ? [{ filename: "resume", url: candidate.resumeUrl, type: "resume" }] : [],
      application_ids: [],
      phone_numbers: candidate.phone ? [{ value: candidate.phone, type: "mobile" }] : [],
      addresses: candidate.location ? [{ value: candidate.location, type: "home" }] : [],
      email_addresses: candidate.email ? [{ value: candidate.email, type: "personal" }] : [],
      website_addresses: [],
      social_media_addresses: [],
      recruiter: null,
      coordinator: null,
      can_email: true,
      tags: candidate.tags ?? [],
      applications: [],
      employments: (candidate.experience ?? []).map((e) => ({
        company_name: e.company,
        title: e.title,
        start_date: e.startDate ?? null,
        end_date: e.endDate ?? null,
      })),
      educations: (candidate.education ?? []).map((e) => ({
        school_name: e.institution,
        degree: e.degree,
        discipline: e.field ?? "",
        start_date: null,
        end_date: null,
      })),
      custom_fields: {},
      keyed_custom_fields: {},
    };
  },
};

const jobMapper: ATSMapper<ATSJob, GreenhouseJob> = {
  unify(gh): ATSJob {
    const hiringManager = gh.hiring_team?.hiring_managers?.[0];
    return {
      remoteId: String(gh.id),
      title: gh.name,
      department: gh.departments?.[0]?.name,
      location: gh.offices?.[0]?.location?.name ?? gh.offices?.[0]?.name,
      status: gh.status === "draft" ? "draft" : gh.status === "closed" ? "cancelled" : "open",
      hiringManagerEmail: hiringManager ? `${hiringManager.first_name}.${hiringManager.last_name}`.toLowerCase() : undefined,
      remoteData: gh as unknown as Record<string, unknown>,
    };
  },

  desunify(job): GreenhouseJob {
    return {
      id: Number(job.remoteId) || 0,
      name: job.title,
      requisition_id: null,
      notes: null,
      confidential: false,
      status: job.status === "draft" ? "draft" : (job.status === "filled" || job.status === "cancelled") ? "closed" : "open",
      created_at: new Date().toISOString(),
      opened_at: null,
      closed_at: null,
      updated_at: new Date().toISOString(),
      is_template: false,
      departments: job.department ? [{ id: 0, name: job.department }] : [],
      offices: job.location ? [{ id: 0, name: job.location, location: { name: job.location } }] : [],
      custom_fields: {},
      keyed_custom_fields: {},
      hiring_team: { hiring_managers: [], recruiters: [], coordinators: [] },
      openings: [],
    };
  },
};

const applicationMapper: ATSMapper<ATSApplication, GreenhouseApplication> = {
  unify(gh): ATSApplication {
    return {
      remoteId: String(gh.id),
      candidateRemoteId: String(gh.candidate_id),
      jobRemoteId: String(gh.jobs?.[0]?.id ?? ""),
      status: gh.status,
      stage: gh.current_stage?.name,
      appliedAt: gh.applied_at,
      rejectedAt: gh.rejected_at ?? undefined,
      source: gh.source?.public_name,
      remoteData: gh as unknown as Record<string, unknown>,
    };
  },

  desunify(app): GreenhouseApplication {
    return {
      id: Number(app.remoteId) || 0,
      candidate_id: Number(app.candidateRemoteId),
      prospect: false,
      applied_at: app.appliedAt ?? "",
      rejected_at: app.rejectedAt ?? null,
      last_activity_at: null,
      location: null,
      source: app.source ? { id: 0, public_name: app.source } : null,
      credited_to: null,
      rejection_reason: null,
      jobs: app.jobRemoteId ? [{ id: Number(app.jobRemoteId), name: "" }] : [],
      job_post_id: null,
      status: app.status,
      current_stage: app.stage ? { id: 0, name: app.stage } : null,
      custom_fields: {},
      keyed_custom_fields: {},
      attachments: [],
    };
  },
};

// -- Auth helpers ---------------------------------------------------------

const GREENHOUSE_HARVEST_BASE = "https://harvest.greenhouse.io/v1";

/**
 * Resolve Greenhouse API key from integration_credentials (per-org).
 * The `credentialId` is the integration_credentials.id for this org+provider.
 */
async function getApiKey(orgId: string): Promise<string> {
  const creds = await getProviderCredentials(orgId, "greenhouse");
  if (creds.type !== "api_key") throw new Error("Greenhouse requires API key credentials");
  return creds.apiKey;
}

async function ghFetch<T>(orgId: string, path: string, params?: Record<string, string>): Promise<T> {
  const apiKey = await getApiKey(orgId);
  const url = new URL(`${GREENHOUSE_HARVEST_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Greenhouse API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// -- Provider implementation ----------------------------------------------

const PAGE_SIZE = 100;

const greenhouseProvider: ATSProviderImpl = {
  provider: "greenhouse",

  getAuthUrl(orgId: string): string {
    // Greenhouse uses API key auth — credentials saved via settings UI
    return `/recruit/settings/integrations`;
  },

  async exchangeCodeForTokens(_code: string, _orgId: string): Promise<string> {
    // Not used — API key saved via saveOrgCredentials action
    throw new Error("Greenhouse uses API key auth. Configure via Settings > Integrations.");
  },

  async syncCandidates(orgId: string, cursor?: string): Promise<ATSSyncResult<ATSCandidate>> {
    const params: Record<string, string> = { per_page: String(PAGE_SIZE) };
    if (cursor) params.page = cursor;

    const raw = await ghFetch<GreenhouseCandidate[]>(orgId, "/candidates", params);
    const items = raw.map((c) => candidateMapper.unify(c));
    const page = Number(cursor ?? "1");

    return {
      items,
      cursor: String(page + 1),
      hasMore: raw.length === PAGE_SIZE,
    };
  },

  async syncJobs(orgId: string, cursor?: string): Promise<ATSSyncResult<ATSJob>> {
    const params: Record<string, string> = { per_page: String(PAGE_SIZE) };
    if (cursor) params.page = cursor;

    const raw = await ghFetch<GreenhouseJob[]>(orgId, "/jobs", params);
    const items = raw.map((j) => jobMapper.unify(j));
    const page = Number(cursor ?? "1");

    return {
      items,
      cursor: String(page + 1),
      hasMore: raw.length === PAGE_SIZE,
    };
  },

  async syncApplications(orgId: string, cursor?: string): Promise<ATSSyncResult<ATSApplication>> {
    const params: Record<string, string> = { per_page: String(PAGE_SIZE) };
    if (cursor) params.page = cursor;

    const raw = await ghFetch<GreenhouseApplication[]>(orgId, "/applications", params);
    const items = raw.map((a) => applicationMapper.unify(a));
    const page = Number(cursor ?? "1");

    return {
      items,
      cursor: String(page + 1),
      hasMore: raw.length === PAGE_SIZE,
    };
  },

  async pushCandidate(orgId: string, candidate: ATSCandidate): Promise<ATSCandidate> {
    const apiKey = await getApiKey(orgId);
    const body = candidateMapper.desunify(candidate);

    const res = await fetch(`${GREENHOUSE_HARVEST_BASE}/candidates`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
        "On-Behalf-Of": "system",
      },
      body: JSON.stringify({
        first_name: body.first_name,
        last_name: body.last_name,
        email_addresses: body.email_addresses,
        phone_numbers: body.phone_numbers,
        tags: body.tags,
        addresses: body.addresses,
      }),
    });

    if (!res.ok) {
      throw new Error(`Greenhouse push candidate error: ${res.status}`);
    }

    const created = (await res.json()) as GreenhouseCandidate;
    return candidateMapper.unify(created);
  },

  async handleWebhook(_connectionId: string, payload: unknown) {
    const event = payload as { action: string; payload: { candidate?: GreenhouseCandidate; application?: GreenhouseApplication; job?: GreenhouseJob } };

    if (event.payload.candidate) {
      return {
        type: "candidate" as const,
        action: (event.action === "delete" ? "deleted" : event.action === "new" ? "created" : "updated") as "created" | "updated" | "deleted",
        data: candidateMapper.unify(event.payload.candidate),
      };
    }

    if (event.payload.application) {
      return {
        type: "application" as const,
        action: "updated" as const,
        data: applicationMapper.unify(event.payload.application),
      };
    }

    return null;
  },
};

// -- Register on import ---------------------------------------------------

registerATSProvider(greenhouseProvider);
