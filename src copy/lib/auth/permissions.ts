/**
 * Org-scoped authorization — static access-control config.
 *
 * Built on better-auth's standard machinery (`createAccessControl`). This
 * file is import-only static data so it can be loaded by `auth/index.ts`
 * without a circular import. The runtime helpers that call `auth.api.*`
 * live in `permissions-helpers.ts`.
 *
 * Adding a new gated resource:
 *  1. Add it to `statement` below.
 *  2. Grant the actions to whichever default roles need them (typically
 *     `adminCustom`, picked up by both admin and owner).
 *  3. Call `requireOrgPermission({ resource: ["action"] })` from the
 *     mutating operation.
 *  4. (Optional) surface the boolean in `getOrgPermissions()`.
 */

import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  integration: ["connect", "disconnect", "manage-credentials"],
  "api-key": ["create", "revoke"],
  rule: ["create", "update", "delete"],
  "governance-record": ["create", "update", "delete"],
  "skill-autonomy": ["update"],
  "member-profile": ["update"],
} as const;

export const ac = createAccessControl(statement);

const adminCustom = {
  integration: ["connect", "disconnect", "manage-credentials"],
  "api-key": ["create", "revoke"],
  rule: ["create", "update", "delete"],
  "governance-record": ["create", "update", "delete"],
  "skill-autonomy": ["update"],
  "member-profile": ["update"],
} as const;

export const member = ac.newRole({ ...memberAc.statements });
export const admin = ac.newRole({ ...adminAc.statements, ...adminCustom });
export const owner = ac.newRole({ ...ownerAc.statements, ...adminCustom });

export const roles = { member, admin, owner };

export type PermissionRequest = Partial<{
  [K in keyof typeof statement]: ReadonlyArray<(typeof statement)[K][number]>;
}>;
