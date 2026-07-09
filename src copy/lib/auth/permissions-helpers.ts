/**
 * Runtime authorization helpers — wrap better-auth's `hasPermission` API.
 * Kept separate from `permissions.ts` to avoid a circular import with
 * `auth/index.ts`, which loads the static `ac` + `roles` from there.
 */

import { headers } from "next/headers";

import { ForbiddenError, requireOrgContext } from "./context";
import { auth } from "./index";
import type { PermissionRequest } from "./permissions";

// Resolve org id from our own context (which falls back to first membership
// when session.activeOrganizationId is null) and forward it explicitly.
// Better-auth's hasPermission endpoint prefers body.organizationId over the
// session's active org, so this avoids spurious NO_ACTIVE_ORGANIZATION errors
// for users whose session hasn't been bound to an org yet.
async function callHasPermission(
  permissions: PermissionRequest,
  organizationId: string,
): Promise<boolean> {
  const result = await auth.api.hasPermission({
    headers: await headers(),
    body: {
      permissions: permissions as Record<string, string[]>,
      organizationId,
    },
  });
  return Boolean(result?.success);
}

/**
 * Throw `ForbiddenError` unless the active session can perform every
 * requested action. Use at the top of mutating operations.
 */
export async function requireOrgPermission(permissions: PermissionRequest): Promise<void> {
  const { organizationId } = await requireOrgContext();
  const ok = await callHasPermission(permissions, organizationId);
  if (!ok) {
    throw new ForbiddenError(`Missing permission: ${JSON.stringify(permissions)}`);
  }
}

/** Non-throwing variant — returns boolean. Use for UI affordance gating. */
export async function checkOrgPermission(permissions: PermissionRequest): Promise<boolean> {
  let organizationId: string;
  try {
    ({ organizationId } = await requireOrgContext());
  } catch (err) {
    // Never swallow Next's redirect/notFound signals — they MUST propagate.
    if (isNextControlFlow(err)) throw err;
    return false;
  }
  try {
    return await callHasPermission(permissions, organizationId);
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    return false;
  }
}

function isNextControlFlow(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("digest" in err)) return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND"));
}

export interface OrgPermissionFlags {
  canManageIntegrations: boolean;
  canManageApiKeys: boolean;
  canManageRules: boolean;
  canManageGovernanceRecords: boolean;
  canConfigureSkillAutonomy: boolean;
  canUpdateMemberProfile: boolean;
  canInviteMember: boolean;
}

const DENY_ALL: OrgPermissionFlags = {
  canManageIntegrations: false,
  canManageApiKeys: false,
  canManageRules: false,
  canManageGovernanceRecords: false,
  canConfigureSkillAutonomy: false,
  canUpdateMemberProfile: false,
  canInviteMember: false,
};

/**
 * One round trip for all permission booleans the UI needs. Add new keys
 * here as the UI grows; client components should depend on this object,
 * never on raw role strings.
 *
 * Resolves the org id once, then runs all checks against it — avoids N
 * redundant session lookups per page render.
 */
export async function getOrgPermissions(): Promise<OrgPermissionFlags> {
  let organizationId: string;
  try {
    ({ organizationId } = await requireOrgContext());
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    return DENY_ALL;
  }
  const checks = await Promise.all([
    callHasPermission({ integration: ["manage-credentials"] }, organizationId).catch(() => false),
    callHasPermission({ "api-key": ["create"] }, organizationId).catch(() => false),
    callHasPermission({ rule: ["update"] }, organizationId).catch(() => false),
    callHasPermission({ "governance-record": ["update"] }, organizationId).catch(() => false),
    callHasPermission({ "skill-autonomy": ["update"] }, organizationId).catch(() => false),
    callHasPermission({ "member-profile": ["update"] }, organizationId).catch(() => false),
    callHasPermission({ invitation: ["create"] }, organizationId).catch(() => false),
  ]);
  return {
    canManageIntegrations: checks[0],
    canManageApiKeys: checks[1],
    canManageRules: checks[2],
    canManageGovernanceRecords: checks[3],
    canConfigureSkillAutonomy: checks[4],
    canUpdateMemberProfile: checks[5],
    canInviteMember: checks[6],
  };
}
