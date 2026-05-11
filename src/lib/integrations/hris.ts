/**
 * Shared HRIS (Human Resource Information System) provider interface.
 *
 * Follows the same registry pattern as calendar.ts, email.ts, and ats.ts.
 * HRIS providers sync employee data — useful for mapping interviewers,
 * hiring managers, and org structure into the recruitment platform.
 *
 * Route handlers and actions import from here — never from a specific provider.
 */

import { db } from "@/db/client";
import { oauthConnections, integrationCredentials } from "@/db/schema/integrations";
import { eq, and } from "drizzle-orm";

// -- Unified types (provider-agnostic) -----------------------------------

export type HRISProvider = "bamboohr" | "workday" | "gusto";

/** Unified employee shape */
export interface HRISEmployee {
  remoteId: string;
  firstName: string;
  lastName: string;
  email?: string;
  personalEmail?: string;
  phone?: string;
  title?: string;
  department?: string;
  division?: string;
  team?: string;
  location?: string;
  managerId?: string;
  employmentStatus: "active" | "inactive" | "terminated" | "on_leave";
  employmentType?: "full_time" | "part_time" | "contractor" | "intern" | "temporary";
  startDate?: string;
  terminationDate?: string;
  avatarUrl?: string;
  remoteData?: Record<string, unknown>;
}

/** Unified department/group shape */
export interface HRISDepartment {
  remoteId: string;
  name: string;
  parentId?: string;
  managerId?: string;
  remoteData?: Record<string, unknown>;
}

/** Unified location shape */
export interface HRISLocation {
  remoteId: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  remoteData?: Record<string, unknown>;
}

/** Result of a sync operation */
export interface HRISSyncResult<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
}

// -- Mapper interface (same pattern as ATS) --------------------------------

export interface HRISMapper<TUnified, TRemote> {
  unify(remote: TRemote): TUnified;
  desunify(unified: TUnified): TRemote;
}

// -- Provider implementation interface ------------------------------------

export interface HRISProviderImpl {
  provider: HRISProvider;

  // Auth
  getAuthUrl(orgId: string): string | Promise<string>;
  exchangeCodeForTokens(code: string, orgId: string): Promise<string>;

  // Inbound sync
  syncEmployees(connectionId: string, cursor?: string): Promise<HRISSyncResult<HRISEmployee>>;
  syncDepartments?(connectionId: string): Promise<HRISSyncResult<HRISDepartment>>;
  syncLocations?(connectionId: string): Promise<HRISSyncResult<HRISLocation>>;

  // Outbound push
  createEmployee?(connectionId: string, employee: Partial<HRISEmployee>): Promise<HRISEmployee>;
  updateEmployee?(connectionId: string, remoteId: string, updates: Partial<HRISEmployee>): Promise<HRISEmployee>;

  // Webhooks
  handleWebhook?(connectionId: string, payload: unknown): Promise<{
    type: "employee" | "department" | "location";
    action: "created" | "updated" | "deleted";
    data: HRISEmployee | HRISDepartment | HRISLocation;
  } | null>;
}

// -- Provider registry ----------------------------------------------------

const providers = new Map<HRISProvider, HRISProviderImpl>();

export function registerHRISProvider(impl: HRISProviderImpl) {
  providers.set(impl.provider, impl);
}

export function getHRISProvider(provider: HRISProvider): HRISProviderImpl {
  const impl = providers.get(provider);
  if (!impl) throw new Error(`HRIS provider "${provider}" is not registered`);
  return impl;
}

export function getRegisteredHRISProviders(): HRISProvider[] {
  return Array.from(providers.keys());
}

// -- API key vs OAuth provider classification ----------------------------

const API_KEY_PROVIDERS: HRISProvider[] = ["bamboohr"];
const OAUTH_PROVIDERS: HRISProvider[] = ["workday", "gusto"];

// -- Provider-agnostic helpers --------------------------------------------

export async function getOrgHRISConnection(organizationId: string) {
  // Check OAuth connections first (Workday, Gusto)
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
        eq(oauthConnections.category, "hris"),
        eq(oauthConnections.status, "active")
      )
    )
    .limit(1);

  if (oauthConn) {
    return { ...oauthConn, source: "connection" as const };
  }

  // Check API key credentials (BambooHR)
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
        eq(integrationCredentials.category, "hris"),
      )
    )
    .limit(1);

  if (credRow && credRow.provider && API_KEY_PROVIDERS.includes(credRow.provider as HRISProvider)) {
    return {
      id: credRow.id,
      provider: credRow.provider,
      accountEmail: null,
      accountName: credRow.provider === "bamboohr" ? "BambooHR" : credRow.provider,
      source: "credentials" as const,
    };
  }

  return null;
}

export async function disconnectHRIS(organizationId: string) {
  await db
    .delete(oauthConnections)
    .where(
      and(
        eq(oauthConnections.organizationId, organizationId),
        eq(oauthConnections.category, "hris")
      )
    );

  await db
    .delete(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.organizationId, organizationId),
        eq(integrationCredentials.category, "hris")
      )
    );
}

export async function syncAllFromHRIS(organizationId: string) {
  const conn = await getOrgHRISConnection(organizationId);
  if (!conn) return null;

  const impl = providers.get(conn.provider as HRISProvider);
  if (!impl) return null;

  const syncId = conn.source === "credentials" ? organizationId : conn.id;

  const employees: HRISEmployee[] = [];
  const departments: HRISDepartment[] = [];
  const locations: HRISLocation[] = [];

  let cursor: string | undefined;
  do {
    const result = await impl.syncEmployees(syncId, cursor);
    employees.push(...result.items);
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  if (impl.syncDepartments) {
    const result = await impl.syncDepartments(syncId);
    departments.push(...result.items);
  }

  if (impl.syncLocations) {
    const result = await impl.syncLocations(syncId);
    locations.push(...result.items);
  }

  return { employees, departments, locations };
}
