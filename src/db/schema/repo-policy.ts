/**
 * Repo Policies — three-state trust policy keyed on git remote URL.
 *
 * `remoteCanonical` collapses SSH/HTTPS variants of the same remote into
 * a single key. Inspired by gstack's `gbrain-repo-policy`, which solves
 * the consultant problem: an agent on Client A's repo shouldn't pollute
 * the shared brain with Client A code while in a Client B session.
 *
 * Policy is enforced at the MCP boundary in `src/lib/auth/repo-policy.ts`.
 */

import { text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";

export const REPO_POLICIES = ["read-write", "read-only", "deny"] as const;
export type RepoPolicy = (typeof REPO_POLICIES)[number];

export const repoPolicies = cozntSchema.table(
  "repo_policies",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    /** Canonical remote URL (e.g. `github.com/foo/bar`). SSH/HTTPS variants collapse. */
    remoteCanonical: text("remote_canonical").notNull(),
    policy: text().$type<RepoPolicy>().notNull().default("read-write"),
    /** Optional link to a coznt project, when the remote maps cleanly to one. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
    updatedById: text("updated_by_id"),
    updatedByName: text("updated_by_name"),
  },
  (table) => [
    uniqueIndex("repo_policies_org_remote_uniq").on(table.organizationId, table.remoteCanonical),
    index("repo_policies_org_idx").on(table.organizationId),
  ],
);

export type RepoPolicyRow = typeof repoPolicies.$inferSelect;
export type NewRepoPolicy = typeof repoPolicies.$inferInsert;
