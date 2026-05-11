/**
 * Gusto HRIS provider implementation.
 *
 * Key Gusto API traits (learned from Nango integration-templates):
 * - OAuth 2.0 auth
 * - Employees are company-scoped (/v1/companies/{company_id}/employees)
 * - Locations as separate endpoint
 * - Supports create, update, and terminate employee actions
 * - Paginated via page/per_page params
 *
 * Ref: https://docs.gusto.com/embedded-payroll/reference
 */

import { db } from "@/db/client";
import { oauthConnections } from "@/db/schema/integrations";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { decrypt, encrypt } from "./encryption";
import { getProviderCredentials } from "./credentials";
import {
  registerHRISProvider,
  type HRISEmployee,
  type HRISDepartment,
  type HRISLocation,
  type HRISMapper,
  type HRISProviderImpl,
  type HRISSyncResult,
} from "./hris";

// -- Gusto-specific types -------------------------------------------------

interface GustoEmployee {
  id: number;
  uuid: string;
  first_name: string;
  last_name: string;
  middle_initial: string | null;
  email: string | null;
  personal_email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  ssn: string | null;
  department: string | null;
  manager_id: number | null;
  current_employment_status: string;
  jobs: Array<{
    id: number;
    title: string;
    hire_date: string;
    current_compensation_id: number;
    payment_unit: string;
    primary: boolean;
    rate: string;
    location_id: number;
    location: {
      id: number;
      city: string;
      state: string;
      country: string;
    } | null;
  }>;
  terminations: Array<{
    id: number;
    effective_date: string;
    run_termination_payroll: boolean;
  }>;
  home_address: {
    street_1: string;
    street_2: string | null;
    city: string;
    state: string;
    zip: string;
    country: string;
  } | null;
}

interface GustoLocation {
  id: number;
  company_id: number;
  phone_number: string | null;
  street_1: string;
  street_2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  active: boolean;
}

// -- Mappers --------------------------------------------------------------

const employeeMapper: HRISMapper<HRISEmployee, GustoEmployee> = {
  unify(gusto): HRISEmployee {
    const primaryJob = gusto.jobs?.find((j) => j.primary) ?? gusto.jobs?.[0];
    const termination = gusto.terminations?.[0];

    const statusMap: Record<string, HRISEmployee["employmentStatus"]> = {
      active: "active",
      inactive: "inactive",
      terminated: "terminated",
      leave_of_absence: "on_leave",
    };

    const typeMap: Record<string, HRISEmployee["employmentType"]> = {
      Hourly: "full_time",
      Salary: "full_time",
    };

    return {
      remoteId: gusto.uuid,
      firstName: gusto.first_name,
      lastName: gusto.last_name,
      email: gusto.email ?? undefined,
      personalEmail: gusto.personal_email ?? undefined,
      phone: gusto.phone ?? undefined,
      title: primaryJob?.title ?? undefined,
      department: gusto.department ?? undefined,
      location: primaryJob?.location
        ? `${primaryJob.location.city}, ${primaryJob.location.state}`
        : undefined,
      managerId: gusto.manager_id ? String(gusto.manager_id) : undefined,
      employmentStatus: statusMap[gusto.current_employment_status] ?? "active",
      employmentType: primaryJob ? (typeMap[primaryJob.payment_unit] ?? "full_time") : undefined,
      startDate: primaryJob?.hire_date ?? undefined,
      terminationDate: termination?.effective_date ?? undefined,
      remoteData: gusto as unknown as Record<string, unknown>,
    };
  },

  desunify(employee): GustoEmployee {
    return {
      id: 0,
      uuid: employee.remoteId,
      first_name: employee.firstName,
      last_name: employee.lastName,
      middle_initial: null,
      email: employee.email ?? null,
      personal_email: employee.personalEmail ?? null,
      phone: employee.phone ?? null,
      date_of_birth: null,
      ssn: null,
      department: employee.department ?? null,
      manager_id: employee.managerId ? Number(employee.managerId) : null,
      current_employment_status: employee.employmentStatus === "active" ? "active" : "terminated",
      jobs: [{
        id: 0,
        title: employee.title ?? "",
        hire_date: employee.startDate ?? "",
        current_compensation_id: 0,
        payment_unit: "Salary",
        primary: true,
        rate: "",
        location_id: 0,
        location: null,
      }],
      terminations: employee.terminationDate
        ? [{ id: 0, effective_date: employee.terminationDate, run_termination_payroll: false }]
        : [],
      home_address: null,
    };
  },
};

const locationMapper: HRISMapper<HRISLocation, GustoLocation> = {
  unify(gusto): HRISLocation {
    return {
      remoteId: String(gusto.id),
      name: `${gusto.city}, ${gusto.state}`,
      city: gusto.city,
      state: gusto.state,
      country: gusto.country,
      remoteData: gusto as unknown as Record<string, unknown>,
    };
  },
  desunify(loc): GustoLocation {
    return {
      id: Number(loc.remoteId) || 0,
      company_id: 0,
      phone_number: null,
      street_1: "",
      street_2: null,
      city: loc.city ?? "",
      state: loc.state ?? "",
      zip: "",
      country: loc.country ?? "",
      active: true,
    };
  },
};

// -- Auth helpers ---------------------------------------------------------

const GUSTO_API_BASE = "https://api.gusto.com";
const GUSTO_AUTH_URL = "https://api.gusto.com/oauth/authorize";
const GUSTO_TOKEN_URL = "https://api.gusto.com/oauth/token";

async function getAccessToken(connectionId: string): Promise<{ token: string; companyId: string }> {
  const [conn] = await db
    .select({
      accessTokenEncrypted: oauthConnections.accessTokenEncrypted,
      refreshTokenEncrypted: oauthConnections.refreshTokenEncrypted,
      tokenExpiresAt: oauthConnections.tokenExpiresAt,
      accountName: oauthConnections.accountName,
      organizationId: oauthConnections.organizationId,
    })
    .from(oauthConnections)
    .where(eq(oauthConnections.id, connectionId))
    .limit(1);

  if (!conn) throw new Error("Gusto connection not found");
  const companyId = conn.accountName ?? "";

  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
  if (expiresAt && expiresAt < new Date() && conn.refreshTokenEncrypted) {
    const creds = await getProviderCredentials(conn.organizationId, "gusto");
    if (creds.type !== "oauth") throw new Error("Gusto requires OAuth credentials");

    const refreshToken = decrypt(conn.refreshTokenEncrypted);
    const res = await fetch(GUSTO_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) throw new Error("Failed to refresh Gusto token");
    const tokens = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };

    await db.update(oauthConnections).set({
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : conn.refreshTokenEncrypted,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }).where(eq(oauthConnections.id, connectionId));

    return { token: tokens.access_token, companyId };
  }

  return { token: decrypt(conn.accessTokenEncrypted), companyId };
}

async function gustoFetch<T>(connectionId: string, path: string, params?: Record<string, string>): Promise<T> {
  const { token, companyId } = await getAccessToken(connectionId);
  const url = new URL(`${GUSTO_API_BASE}${path.replace("{company_id}", companyId)}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) throw new Error(`Gusto API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// -- Provider implementation ----------------------------------------------

const PAGE_SIZE = 100;

const gustoProvider: HRISProviderImpl = {
  provider: "gusto",

  async getAuthUrl(orgId: string): Promise<string> {
    const creds = await getProviderCredentials(orgId, "gusto");
    if (creds.type !== "oauth") throw new Error("Gusto requires OAuth credentials");

    const state = Buffer.from(JSON.stringify({ orgId, provider: "gusto" })).toString("base64");
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: creds.redirectUri,
      response_type: "code",
      state,
    });
    return `${GUSTO_AUTH_URL}?${params.toString()}`;
  },

  async exchangeCodeForTokens(code: string, orgId: string): Promise<string> {
    const creds = await getProviderCredentials(orgId, "gusto");
    if (creds.type !== "oauth") throw new Error("Gusto requires OAuth credentials");

    const res = await fetch(GUSTO_TOKEN_URL, {
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

    if (!res.ok) throw new Error("Failed to exchange Gusto auth code");
    const tokens = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };

    // Get company ID from the token
    const meRes = await fetch(`${GUSTO_API_BASE}/v1/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const me = (await meRes.json()) as { roles: { companies: Array<{ id: string }> } };
    const companyId = me.roles?.companies?.[0]?.id ?? "";

    const id = nanoid();
    await db.insert(oauthConnections).values({
      id,
      organizationId: orgId,
      userId: "system",
      provider: "gusto",
      category: "hris",
      status: "active",
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      accountName: companyId,
    });

    return id;
  },

  async syncEmployees(connectionId: string, cursor?: string): Promise<HRISSyncResult<HRISEmployee>> {
    const page = cursor ? Number(cursor) : 1;
    const employees = await gustoFetch<GustoEmployee[]>(
      connectionId,
      "/v1/companies/{company_id}/employees",
      { page: String(page), per_page: String(PAGE_SIZE) },
    );

    return {
      items: employees.map((e) => employeeMapper.unify(e)),
      cursor: String(page + 1),
      hasMore: employees.length === PAGE_SIZE,
    };
  },

  async syncLocations(connectionId: string): Promise<HRISSyncResult<HRISLocation>> {
    const locations = await gustoFetch<GustoLocation[]>(
      connectionId,
      "/v1/companies/{company_id}/locations",
    );

    return {
      items: locations.map((l) => locationMapper.unify(l)),
      hasMore: false,
    };
  },

  async createEmployee(connectionId: string, employee: Partial<HRISEmployee>): Promise<HRISEmployee> {
    const { token, companyId } = await getAccessToken(connectionId);
    const body = {
      first_name: employee.firstName,
      last_name: employee.lastName,
      email: employee.email,
      date_of_birth: null,
    };

    const res = await fetch(`${GUSTO_API_BASE}/v1/companies/${companyId}/employees`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Gusto create employee error: ${res.status}`);
    const created = (await res.json()) as GustoEmployee;
    return employeeMapper.unify(created);
  },

  async updateEmployee(connectionId: string, remoteId: string, updates: Partial<HRISEmployee>): Promise<HRISEmployee> {
    const { token } = await getAccessToken(connectionId);
    const body: Record<string, unknown> = {};
    if (updates.firstName) body.first_name = updates.firstName;
    if (updates.lastName) body.last_name = updates.lastName;
    if (updates.email) body.email = updates.email;

    const res = await fetch(`${GUSTO_API_BASE}/v1/employees/${remoteId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Gusto update employee error: ${res.status}`);
    const updated = (await res.json()) as GustoEmployee;
    return employeeMapper.unify(updated);
  },
};

// -- Register on import ---------------------------------------------------

registerHRISProvider(gustoProvider);
