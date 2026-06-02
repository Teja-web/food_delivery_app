/**
 * Repo-policy enforcement at the MCP boundary.
 *
 * Two layers:
 *   1. `enforceSessionBind(orgId, remoteUrl)` — runs in `session_start`.
 *      Auto-creates the policy row on first touch (default: read-write).
 *      Throws `RepoDeniedError` when the policy is `deny`.
 *   2. `enforceVerbCall(policy, verbName)` — runs before every MCP verb
 *      dispatch. Throws `RepoReadOnlyError` when the policy is `read-only`
 *      and the verb is in the static write-verb set.
 *
 * Read verbs (`get_*`, `list_*`, `search_*`) pass through unconditionally.
 */

import {
  autoCreateOnFirstTouch,
  getPolicyForRemote,
} from "@/operations/integration/repo-policies";
import type { RepoPolicy } from "@/db/schema/repo-policy";

export class RepoDeniedError extends Error {
  status = 403;
  code = "repo_denied" as const;
  constructor(remoteCanonical: string) {
    super(
      `Repo policy denies access to ${remoteCanonical}. Update the policy at /settings/repos.`,
    );
    this.name = "RepoDeniedError";
  }
}

export class RepoReadOnlyError extends Error {
  status = 403;
  code = "repo_read_only" as const;
  constructor(verbName: string, remoteCanonical: string) {
    super(
      `Repo policy on ${remoteCanonical} is read-only — verb \`${verbName}\` is denied. Use a read verb or update the policy.`,
    );
    this.name = "RepoReadOnlyError";
  }
}

/**
 * Verbs that mutate coznt state. These are denied under `read-only`. New
 * write verbs MUST be added here to be enforced.
 */
export const WRITE_VERBS = new Set<string>([
  "invoke_skill",
  "upsert_plan",
  "mark_gate_passed",
  "submit_for_approval",
  "submit_phase_for_review",
  "advance_phase",
  "create_requirement",
  "push_requirements",
  "update_work_item_status",
  "update_test_result",
  "log_decision",
  "generate_pipeline",
  "generate_tests",
]);

export interface RepoPolicyResolution {
  remoteCanonical: string;
  policy: RepoPolicy;
  /** Rule id when the policy came from a customer-authored row; `null` for synthetic defaults. */
  ruleId: string | null;
}

/**
 * Resolve the policy for a session binding. Auto-creates on first touch.
 * Throws `RepoDeniedError` immediately if the policy is `deny`.
 */
export async function enforceSessionBind(
  organizationId: string,
  remoteUrl: string,
  options: { actorId?: string; actorName?: string; projectId?: string | null } = {},
): Promise<RepoPolicyResolution> {
  const { row } = await autoCreateOnFirstTouch(organizationId, remoteUrl, options);
  if (row.policy === "deny") {
    throw new RepoDeniedError(row.remoteCanonical);
  }
  return {
    remoteCanonical: row.remoteCanonical,
    policy: row.policy,
    ruleId: row.id,
  };
}

/**
 * Block write verbs under read-only. Caller passes the verb's MCP name
 * (e.g. `invoke_skill`) and the policy resolved at session bind.
 *
 * Returns silently on allow. Throws `RepoReadOnlyError` on block.
 */
export function enforceVerbCall(
  resolution: RepoPolicyResolution,
  verbName: string,
): void {
  if (resolution.policy !== "read-only") return;
  if (!WRITE_VERBS.has(verbName)) return;
  throw new RepoReadOnlyError(verbName, resolution.remoteCanonical);
}

/**
 * Lookup variant — used by routes that need to resolve the current policy
 * without binding a new session.
 */
export async function lookupRepoPolicy(
  organizationId: string,
  remoteUrl: string,
): Promise<RepoPolicy | null> {
  const row = await getPolicyForRemote(organizationId, remoteUrl);
  return row?.policy ?? null;
}

/**
 * Per-route enforcement. Write routes call this at the top of their
 * handler before performing the mutation. The MCP client passes the
 * canonical remote in the `X-Coznt-Repo-Url` header on every request.
 *
 * When the header is absent (legacy CLI, manual curl) the check is
 * skipped — `session_start` is the primary chokepoint for `deny`; this
 * is the secondary check that prevents `read-only` repos from
 * mutating coznt state through write verbs.
 */
export async function enforceWriteVerbFromHeader(
  req: Request,
  organizationId: string,
  verbName: string,
): Promise<void> {
  const remoteUrl = req.headers.get("x-coznt-repo-url");
  if (!remoteUrl) return;
  const policy = await lookupRepoPolicy(organizationId, remoteUrl);
  if (!policy) return;
  if (policy === "deny") {
    throw new RepoDeniedError(remoteUrl);
  }
  if (policy === "read-only" && WRITE_VERBS.has(verbName)) {
    throw new RepoReadOnlyError(verbName, remoteUrl);
  }
}
