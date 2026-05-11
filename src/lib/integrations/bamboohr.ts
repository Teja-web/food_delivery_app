/**
 * BambooHR HRIS provider implementation.
 *
 * Key BambooHR API traits (learned from Nango integration-templates):
 * - API key auth (Basic auth with API key as password, "x" as username — unusual)
 * - Uses Custom Reports API for bulk employee data (POST /v1/reports/custom)
 * - No pagination — returns all employees in one response
 * - Incremental sync via lastChanged filter
 * - Rich employee fields: personal info, job info, compensation, supervisor
 *
 * Ref: https://documentation.bamboohr.com/reference
 */

import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { getProviderCredentials } from "./credentials";
import {
  registerHRISProvider,
  type HRISEmployee,
  type HRISDepartment,
  type HRISMapper,
  type HRISProviderImpl,
  type HRISSyncResult,
} from "./hris";

// -- BambooHR-specific types ----------------------------------------------

interface BambooHREmployee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  address1: string | null;
  bestEmail: string | null;
  workEmail: string | null;
  jobTitle: string | null;
  hireDate: string | null;
  supervisorId: string | null;
  supervisor: string | null;
  department: string | null;
  division: string | null;
  location: string | null;
  status: string | null;
  employmentHistoryStatus: string | null;
  terminationDate: string | null;
  photoUrl: string | null;
  mobilePhone: string | null;
  workPhone: string | null;
  homePhone: string | null;
}

interface BambooHRCustomReportResponse {
  employees: BambooHREmployee[];
}

// -- Mapper ---------------------------------------------------------------

const employeeMapper: HRISMapper<HRISEmployee, BambooHREmployee> = {
  unify(bhr): HRISEmployee {
    const statusMap: Record<string, HRISEmployee["employmentStatus"]> = {
      Active: "active",
      Inactive: "inactive",
      Terminated: "terminated",
    };

    return {
      remoteId: bhr.id,
      firstName: bhr.firstName,
      lastName: bhr.lastName,
      email: bhr.workEmail ?? bhr.bestEmail ?? undefined,
      personalEmail: bhr.bestEmail ?? undefined,
      phone: bhr.mobilePhone ?? bhr.workPhone ?? bhr.homePhone ?? undefined,
      title: bhr.jobTitle ?? undefined,
      department: bhr.department ?? undefined,
      division: bhr.division ?? undefined,
      location: bhr.location ?? undefined,
      managerId: bhr.supervisorId ?? undefined,
      employmentStatus: statusMap[bhr.status ?? ""] ?? "active",
      startDate: bhr.hireDate ?? undefined,
      terminationDate: bhr.terminationDate ?? undefined,
      avatarUrl: bhr.photoUrl ?? undefined,
      remoteData: bhr as unknown as Record<string, unknown>,
    };
  },

  desunify(employee): BambooHREmployee {
    return {
      id: employee.remoteId,
      employeeNumber: "",
      firstName: employee.firstName,
      lastName: employee.lastName,
      dateOfBirth: null,
      address1: null,
      bestEmail: employee.personalEmail ?? employee.email ?? null,
      workEmail: employee.email ?? null,
      jobTitle: employee.title ?? null,
      hireDate: employee.startDate ?? null,
      supervisorId: employee.managerId ?? null,
      supervisor: null,
      department: employee.department ?? null,
      division: employee.division ?? null,
      location: employee.location ?? null,
      status: employee.employmentStatus === "active" ? "Active" : employee.employmentStatus === "terminated" ? "Terminated" : "Inactive",
      employmentHistoryStatus: null,
      terminationDate: employee.terminationDate ?? null,
      photoUrl: employee.avatarUrl ?? null,
      mobilePhone: employee.phone ?? null,
      workPhone: null,
      homePhone: null,
    };
  },
};

// -- Auth helpers ---------------------------------------------------------

async function getConnection(orgId: string) {
  const creds = await getProviderCredentials(orgId, "bamboohr");
  if (creds.type !== "api_key") throw new Error("BambooHR requires API key credentials");
  return { apiKey: creds.apiKey, subdomain: creds.config.subdomain ?? "" };
}

async function bambooFetch<T>(orgId: string, method: string, endpoint: string, body?: unknown): Promise<T> {
  const { apiKey, subdomain } = await getConnection(orgId);
  const url = `https://api.bamboohr.com/api/gateway.php/${subdomain}${endpoint}`;

  const res = await fetch(url, {
    method,
    headers: {
      // BambooHR uses API key as password with any username
      Authorization: `Basic ${Buffer.from(`${apiKey}:x`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) throw new Error(`BambooHR API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// -- Employee report fields (from Nango's implementation) -----------------

const EMPLOYEE_FIELDS = [
  "id", "employeeNumber", "firstName", "lastName", "dateOfBirth",
  "address1", "bestEmail", "workEmail", "jobTitle", "hireDate",
  "supervisorId", "supervisor", "department", "division", "location",
  "status", "employmentHistoryStatus", "terminationDate", "photoUrl",
  "mobilePhone", "workPhone", "homePhone",
];

// -- Provider implementation ----------------------------------------------

const bamboohrProvider: HRISProviderImpl = {
  provider: "bamboohr",

  getAuthUrl(orgId: string): string {
    return `/recruit/settings/integrations`;
  },

  async exchangeCodeForTokens(_code: string, _orgId: string): Promise<string> {
    throw new Error("BambooHR uses API key auth. Configure via Settings > Integrations.");
  },

  async syncEmployees(orgId: string): Promise<HRISSyncResult<HRISEmployee>> {
    // BambooHR Custom Reports API returns all employees at once (no pagination)
    const reportData = {
      title: "Current Employees",
      filters: {
        lastChanged: { includeNull: "no" },
      },
      fields: EMPLOYEE_FIELDS,
    };

    const response = await bambooFetch<BambooHRCustomReportResponse>(
      orgId,
      "POST",
      "/v1/reports/custom?format=JSON&onlyCurrent=true",
      reportData,
    );

    return {
      items: response.employees.map((e) => employeeMapper.unify(e)),
      hasMore: false,
    };
  },

  async syncDepartments(orgId: string): Promise<HRISSyncResult<HRISDepartment>> {
    const result = await this.syncEmployees(orgId);
    const deptMap = new Map<string, HRISDepartment>();

    for (const emp of result.items) {
      if (emp.department && !deptMap.has(emp.department)) {
        deptMap.set(emp.department, {
          remoteId: emp.department,
          name: emp.department,
        });
      }
    }

    return {
      items: Array.from(deptMap.values()),
      hasMore: false,
    };
  },

  async createEmployee(orgId: string, employee: Partial<HRISEmployee>): Promise<HRISEmployee> {
    const body: Record<string, string> = {};
    if (employee.firstName) body.firstName = employee.firstName;
    if (employee.lastName) body.lastName = employee.lastName;
    if (employee.email) body.workEmail = employee.email;
    if (employee.title) body.jobTitle = employee.title;
    if (employee.department) body.department = employee.department;
    if (employee.startDate) body.hireDate = employee.startDate;

    await bambooFetch<never>(orgId, "POST", "/v1/employees", body);

    return {
      remoteId: "",
      firstName: employee.firstName ?? "",
      lastName: employee.lastName ?? "",
      email: employee.email,
      title: employee.title,
      department: employee.department,
      employmentStatus: "active",
      startDate: employee.startDate,
    };
  },

  async updateEmployee(orgId: string, remoteId: string, updates: Partial<HRISEmployee>): Promise<HRISEmployee> {
    const body: Record<string, string> = {};
    if (updates.firstName) body.firstName = updates.firstName;
    if (updates.lastName) body.lastName = updates.lastName;
    if (updates.email) body.workEmail = updates.email;
    if (updates.title) body.jobTitle = updates.title;
    if (updates.department) body.department = updates.department;

    await bambooFetch(orgId, "POST", `/v1/employees/${remoteId}`, body);

    return {
      remoteId,
      firstName: updates.firstName ?? "",
      lastName: updates.lastName ?? "",
      email: updates.email,
      title: updates.title,
      department: updates.department,
      employmentStatus: updates.employmentStatus ?? "active",
    };
  },
};

// -- Register on import ---------------------------------------------------

registerHRISProvider(bamboohrProvider);
