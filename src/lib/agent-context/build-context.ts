import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { planArtifacts as plans } from "@/db/schema/plan/plan-artifact";
import { projectLearnings } from "@/db/schema/plan/project-learning";
import { projects, type Project } from "@/db/schema/project";
import { repositories } from "@/db/schema/repository";
import { rules } from "@/db/schema/rule";
import { skills } from "@/db/schema/skill/skill";
import { getSkillAutonomy, LEVEL_BLURBS, type LevelName } from "@/operations/skill/skill-autonomy";

import type {
  McpProjectArtifacts,
  McpResponse,
  McpWelcome,
} from "./schemas";
import {
  resolveRecommendedKickoff,
  type RecommendedKickoff,
} from "./recommended-kickoff";
import { gatherProjectArtifacts } from "./project-artifacts";

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Build the session-start welcome block from already-fetched data.
 * Pure — no I/O — so the response builder can call it after its parallel
 * fetches resolve. Caps `nextActions` at 3 to keep the agent's attention
 * budget tight.
 */
function buildWelcome(args: {
  project: Project;
  recommendedKickoff: RecommendedKickoff | null;
  projectArtifacts: McpProjectArtifacts;
}): McpWelcome {
  const { project, recommendedKickoff, projectArtifacts } = args;
  const headline = project.description
    ? `${project.name} — ${truncate(project.description, 140)}`
    : `${project.name} — no project description set yet`;

  const nextActions: string[] = [];
  if (recommendedKickoff) {
    nextActions.push(recommendedKickoff.action);
  }
  if (projectArtifacts.approvals.pendingTotal > 0) {
    nextActions.push(
      `Review ${projectArtifacts.approvals.pendingTotal} pending approval(s) before starting new work`,
    );
  }
  if (!project.description) {
    nextActions.push(
      "Ask the user to describe what this project is so future sessions have context",
    );
  }

  return {
    headline,
    summary: project.description ?? null,
    nextActions: nextActions.slice(0, 3),
  };
}

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3029";
  return `${base.replace(/\/$/, "")}${path}`;
}

const LEVEL_LABEL: Record<LevelName, "OBSERVE" | "PROPOSE" | "MERGE" | "LEAD"> = {
  observe: "OBSERVE",
  propose: "PROPOSE",
  merge: "MERGE",
  lead: "LEAD",
};

export class McpProjectAmbiguousError extends Error {
  status = 409;
  details: { candidates: Array<{ id: string; name: string; slug: string }> };
  constructor(candidates: Project[]) {
    super("Multiple projects match this repo. Specify the project explicitly.");
    this.name = "McpProjectAmbiguousError";
    this.details = {
      candidates: candidates.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    };
  }
}

export class McpProjectNotFoundError extends Error {
  status = 404;
  details: { fixUrl: string };
  constructor() {
    super("This API key isn't bound to any project. Bind it on the project cockpit.");
    this.name = "McpProjectNotFoundError";
    this.details = { fixUrl: appUrl("/projects") };
  }
}

/**
 * Look up the primary GitHub repository URL for a project. Returns the
 * first source=github row's `url` (or `identifier` when url is null).
 */
async function getPrimaryRepoUrlForProject(projectId: string): Promise<string | null> {
  const rows = await db
    .select({ url: repositories.url, identifier: repositories.identifier })
    .from(repositories)
    .where(and(eq(repositories.projectId, projectId), eq(repositories.source, "github")))
    .limit(1);
  if (rows.length === 0) return null;
  return rows[0].url ?? rows[0].identifier ?? null;
}

/**
 * Resolve a project from a request. Prefer the API key's bound project; fall
 * back to substring-matching `repoUrl` against any `repositories` row.
 * Throws `McpProjectAmbiguousError` when multiple projects match the repo.
 */
async function resolveProject(
  organizationId: string,
  keyProjectId: string | null,
  repoUrl?: string,
): Promise<Project> {
  if (keyProjectId) {
    const row = await db.query.projects.findFirst({
      where: and(eq(projects.id, keyProjectId), eq(projects.organizationId, organizationId)),
    });
    if (!row) throw new McpProjectNotFoundError();
    return row;
  }
  if (repoUrl) {
    // Resolve via `repositories` rows — repo url moved off `projects`.
    const repoRows = await db
      .select({
        projectId: repositories.projectId,
        url: repositories.url,
        identifier: repositories.identifier,
      })
      .from(repositories)
      .where(eq(repositories.organizationId, organizationId));
    const matchedProjectIds = new Set<string>();
    const target = repoUrl.toLowerCase();
    for (const r of repoRows) {
      const candidates = [r.url, r.identifier].filter((s): s is string => Boolean(s));
      for (const c of candidates) {
        const v = c.toLowerCase();
        if (v.includes(target) || target.includes(v)) {
          matchedProjectIds.add(r.projectId);
          break;
        }
      }
    }
    if (matchedProjectIds.size === 1) {
      const [pid] = Array.from(matchedProjectIds);
      const proj = await db.query.projects.findFirst({
        where: and(eq(projects.id, pid), eq(projects.organizationId, organizationId)),
      });
      if (proj) return proj;
    }
    if (matchedProjectIds.size > 1) {
      const matches = await db.query.projects.findMany({
        where: and(eq(projects.organizationId, organizationId)),
      });
      throw new McpProjectAmbiguousError(
        matches.filter((p) => matchedProjectIds.has(p.id)),
      );
    }
  }
  throw new McpProjectNotFoundError();
}

export async function buildMcpContext(args: {
  organizationId: string;
  keyProjectId: string | null;
  repoUrl?: string;
  workItemKey?: string;
}): Promise<McpResponse> {
  const started = Date.now();

  const project = await resolveProject(args.organizationId, args.keyProjectId, args.repoUrl);

  const [
    activeRules,
    projectSkills,
    adrPlans,
    learnings,
    primaryRepoUrl,
    recommendedKickoff,
    projectArtifacts,
  ] = await Promise.all([
    db.query.rules.findMany({
      where: and(
        eq(rules.organizationId, project.organizationId),
        eq(rules.enabled, true),
      ),
      limit: 25,
      orderBy: [desc(rules.updatedAt)],
    }),
    db.query.skills.findMany({
      where: and(
        eq(skills.organizationId, project.organizationId),
        eq(skills.enabled, true),
      ),
      limit: 25,
    }),
    db.query.planArtifacts.findMany({
      where: and(
        eq(plans.organizationId, project.organizationId),
        eq(plans.projectId, project.id),
        eq(plans.kind, "adr"),
      ),
      orderBy: [desc(plans.updatedAt)],
      limit: 10,
    }),
    db.query.projectLearnings.findMany({
      where: and(
        eq(projectLearnings.organizationId, project.organizationId),
        eq(projectLearnings.projectId, project.id),
        isNull(projectLearnings.deletedAt),
      ),
      orderBy: [asc(projectLearnings.pinOrder), desc(projectLearnings.createdAt)],
      limit: 20,
    }),
    getPrimaryRepoUrlForProject(project.id),
    resolveRecommendedKickoff(project.organizationId, project),
    gatherProjectArtifacts(project.organizationId, project.id),
  ]);

  const skillsWithAutonomy = await Promise.all(
    projectSkills.map(async (s) => {
      const autonomy = await getSkillAutonomy(s.id, project.id);
      return {
        slug: s.slug,
        level: LEVEL_LABEL[autonomy.levelName],
        autonomyDescription: LEVEL_BLURBS[autonomy.levelName],
        url: appUrl(`/skills/${s.id}`),
      };
    }),
  );

  const welcome = buildWelcome({ project, recommendedKickoff, projectArtifacts });

  const response: McpResponse = {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      url: appUrl(`/projects/${project.id}`),
      repoUrl: primaryRepoUrl,
    },
    welcome,
    workItem: args.workItemKey
      ? {
          key: args.workItemKey,
          title: args.workItemKey,
          url: null,
        }
      : null,
    recommendedKickoff,
    projectArtifacts,
    rules: activeRules.map((r) => ({
      id: r.id,
      title: r.title,
      severity: r.severity ?? "warning",
      url: appUrl(`/rules/${r.id}`),
    })),
    skills: skillsWithAutonomy,
    adrs: adrPlans.map((p) => ({
      id: p.id,
      title: p.title,
      url: appUrl(`/plans/${p.id}`),
    })),
    learnings: learnings.map((l) => ({
      id: l.id,
      body: l.body,
      pinned: l.pinOrder !== null,
      createdAt: l.createdAt.toISOString(),
      createdByName: l.createdByName,
    })),
    meta: {
      responseTimeMs: Date.now() - started,
      cacheStatus: "miss" as const,
      computedAt: new Date().toISOString(),
    },
  };
  return response;
}
