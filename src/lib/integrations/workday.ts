/**
 * Workday HRIS provider implementation.
 *
 * Key Workday API traits (learned from Nango integration-templates):
 * - OAuth 2.0 auth (or RaaS reports for read-only)
 * - Workers API for employee data (/workers)
 * - Locations and groups/organizations as separate endpoints
 * - Complex nested response structure with worker profiles
 * - Pagination via offset/limit
 *
 * Ref: https://community.workday.com/sites/default/files/file-hosting/restapi/index.html
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

// -- Workday-specific types -----------------------------------------------

interface WorkdayWorker {
  id: string;
  descriptor: string;
  primaryWorkEmail: string;
  primaryWorkPhone: string;
  primarySupervisoryOrganization: {
    id: string;
    descriptor: string;
  } | null;
  businessTitle: string;
  location: {
    id: string;
    descriptor: string;
  } | null;
  hireDate: string;
  terminationDate: string | null;
  workerStatus: {
    descriptor: string;
    terminated: boolean;
    active: boolean;
    onLeave: boolean;
  };
  photo: string | null;
  managerId: string | null;
  employeeType: string | null;
}

interface WorkdayOrganization {
  id: string;
  descriptor: string;
  organizationType: { descriptor: string } | null;
  managerId: string | null;
  parentId: string | null;
}

interface WorkdayLocation {
  id: string;
  descriptor: string;
  address: {
    citySubdivision1: string;
    countryRegion: { descriptor: string } | null;
    country: { descriptor: string } | null;
  } | null;
}

interface WorkdayListResponse<T> {
  data: T[];
  total: number;
}

// -- Mappers --------------------------------------------------------------

const employeeMapper: HRISMapper<HRISEmployee, WorkdayWorker> = {
  unify(wd): HRISEmployee {
    const [firstName = "", ...rest] = wd.descriptor.split(" ");
    const statusMap = (): HRISEmployee["employmentStatus"] => {
      if (wd.workerStatus?.terminated) return "terminated";
      if (wd.workerStatus?.onLeave) return "on_leave";
      if (wd.workerStatus?.active) return "active";
      return "inactive";
    };

    return {
      remoteId: wd.id,
      firstName,
      lastName: rest.join(" "),
      email: wd.primaryWorkEmail || undefined,
      phone: wd.primaryWorkPhone || undefined,
      title: wd.businessTitle || undefined,
      department: wd.primarySupervisoryOrganization?.descriptor || undefined,
      location: wd.location?.descriptor || undefined,
      managerId: wd.managerId ?? undefined,
      employmentStatus: statusMap(),
      startDate: wd.hireDate || undefined,
      terminationDate: wd.terminationDate ?? undefined,
      avatarUrl: wd.photo ?? undefined,
      remoteData: wd as unknown as Record<string, unknown>,
    };
  },

  desunify(employee): WorkdayWorker {
    return {
      id: employee.remoteId,
      descriptor: `${employee.firstName} ${employee.lastName}`,
      primaryWorkEmail: employee.email ?? "",
      primaryWorkPhone: employee.phone ?? "",
      primarySupervisoryOrganization: employee.department
        ? { id: "", descriptor: employee.department }
        : null,
      businessTitle: employee.title ?? "",
      location: employee.location ? { id: "", descriptor: employee.location } : null,
      hireDate: employee.startDate ?? "",
      terminationDate: employee.terminationDate ?? null,
      workerStatus: {
        descriptor: employee.employmentStatus,
        terminated: employee.employmentStatus === "terminated",
        active: employee.employmentStatus === "active",
        onLeave: employee.employmentStatus === "on_leave",
      },
      photo: employee.avatarUrl ?? null,
      managerId: employee.managerId ?? null,
      employeeType: null,
    };
  },
};

const departmentMapper: HRISMapper<HRISDepartment, WorkdayOrganization> = {
  unify(wd): HRISDepartment {
    return {
      remoteId: wd.id,
      name: wd.descriptor,
      parentId: wd.parentId ?? undefined,
      managerId: wd.managerId ?? undefined,
      remoteData: wd as unknown as Record<string, unknown>,
    };
  },
  desunify(dept): WorkdayOrganization {
    return {
      id: dept.remoteId,
      descriptor: dept.name,
      organizationType: null,
      managerId: dept.managerId ?? null,
      parentId: dept.parentId ?? null,
    };
  },
};

const locationMapper: HRISMapper<HRISLocation, WorkdayLocation> = {
  unify(wd): HRISLocation {
    return {
      remoteId: wd.id,
      name: wd.descriptor,
      city: wd.address?.citySubdivision1,
      state: wd.address?.countryRegion?.descriptor,
      country: wd.address?.country?.descriptor,
      remoteData: wd as unknown as Record<string, unknown>,
    };
  },
  desunify(loc): WorkdayLocation {
    return {
      id: loc.remoteId,
      descriptor: loc.name,
      address: null,
    };
  },
};

// -- Auth helpers ---------------------------------------------------------

const WORKDAY_TOKEN_URL_TEMPLATE = "https://wd2-impl-services1.workday.com/ccx/oauth2/{tenant}/token";

async function getAccessToken(connectionId: string): Promise<{ token: string; tenant: string }> {
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

  if (!conn) throw new Error("Workday connection not found");
  const tenant = conn.accountName ?? "";

  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
  if (expiresAt && expiresAt < new Date() && conn.refreshTokenEncrypted) {
    const creds = await getProviderCredentials(conn.organizationId, "workday");
    if (creds.type !== "oauth") throw new Error("Workday requires OAuth credentials");

    const refreshToken = decrypt(conn.refreshTokenEncrypted);
    const tokenUrl = WORKDAY_TOKEN_URL_TEMPLATE.replace("{tenant}", tenant);
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) throw new Error("Failed to refresh Workday token");
    const tokens = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };

    await db.update(oauthConnections).set({
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : conn.refreshTokenEncrypted,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }).where(eq(oauthConnections.id, connectionId));

    return { token: tokens.access_token, tenant };
  }

  return { token: decrypt(conn.accessTokenEncrypted), tenant };
}

async function workdayFetch<T>(connectionId: string, path: string, params?: Record<string, string>): Promise<T> {
  const { token, tenant } = await getAccessToken(connectionId);
  const baseUrl = `https://wd2-impl-services1.workday.com/ccx/api/v1/${tenant}`;
  const url = new URL(`${baseUrl}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Workday API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// -- Provider implementation ----------------------------------------------

const PAGE_SIZE = 100;

const workdayProvider: HRISProviderImpl = {
  provider: "workday",

  async getAuthUrl(orgId: string): Promise<string> {
    // Workday OAuth URL varies by tenant — redirect to settings page for setup
    return `/settings/integrations/workday?orgId=${orgId}`;
  },

  async exchangeCodeForTokens(code: string, orgId: string): Promise<string> {
    const creds = await getProviderCredentials(orgId, "workday");
    if (creds.type !== "oauth") throw new Error("Workday requires OAuth credentials");

    // Workday tenant must be provided alongside the code
    // Expected format: "code:tenant"
    const [authCode, tenant] = code.split(":");
    if (!authCode || !tenant) throw new Error("Expected format: code:tenant");

    const tokenUrl = WORKDAY_TOKEN_URL_TEMPLATE.replace("{tenant}", tenant);
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: creds.redirectUri,
        code: authCode,
      }),
    });

    if (!res.ok) throw new Error("Failed to exchange Workday auth code");
    const tokens = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };

    const id = nanoid();
    await db.insert(oauthConnections).values({
      id,
      organizationId: orgId,
      userId: "system",
      provider: "workday",
      category: "hris",
      status: "active",
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      accountName: tenant,
    });

    return id;
  },

  async syncEmployees(connectionId: string, cursor?: string): Promise<HRISSyncResult<HRISEmployee>> {
    const offset = cursor ? Number(cursor) : 0;
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE),
      offset: String(offset),
    };

    const response = await workdayFetch<WorkdayListResponse<WorkdayWorker>>(
      connectionId,
      "/workers",
      params,
    );

    return {
      items: response.data.map((w) => employeeMapper.unify(w)),
      cursor: String(offset + PAGE_SIZE),
      hasMore: offset + PAGE_SIZE < response.total,
    };
  },

  async syncDepartments(connectionId: string): Promise<HRISSyncResult<HRISDepartment>> {
    const response = await workdayFetch<WorkdayListResponse<WorkdayOrganization>>(
      connectionId,
      "/organizations",
      { limit: "200" },
    );

    return {
      items: response.data.map((o) => departmentMapper.unify(o)),
      hasMore: false,
    };
  },

  async syncLocations(connectionId: string): Promise<HRISSyncResult<HRISLocation>> {
    const response = await workdayFetch<WorkdayListResponse<WorkdayLocation>>(
      connectionId,
      "/locations",
      { limit: "200" },
    );

    return {
      items: response.data.map((l) => locationMapper.unify(l)),
      hasMore: false,
    };
  },
};

// -- Register on import ---------------------------------------------------

registerHRISProvider(workdayProvider);
