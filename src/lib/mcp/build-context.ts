import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { plans } from "@/db/schema/plan";
import { projects, type Project } from "@/db/schema/project";
import { rules } from "@/db/schema/rule";
import { skills } from "@/db/schema/skill";
import { PHASE_GUIDANCE } from "@/domain/phases";
import { getSkillAutonomy, LEVEL_BLURBS, type LevelName } from "@/operations/skill-autonomy";

import { getAllowedTools } from "./phase-enforcement";
import type { McpResponse } from "./schemas";

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
 * Resolve a project from a request. Prefer the API key's bound project; fall
 * back to `repoUrl` if the key is org-wide. Throws `McpProjectAmbiguousError`
 * when multiple projects match the repo.
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
    // Match on repoUrl substring (case-insensitive). v1 heuristic.
    const allProjects = await db.query.projects.findMany({
      where: eq(projects.organizationId, organizationId),
    });
    const matches = allProjects.filter((p) => {
      if (!p.repoUrl) return false;
      return p.repoUrl.toLowerCase().includes(repoUrl.toLowerCase()) ||
        repoUrl.toLowerCase().includes(p.repoUrl.toLowerCase());
    });
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new McpProjectAmbiguousError(matches);
  }
  throw new McpProjectNotFoundError();
}

const PHASE_LABEL: Record<string, string> = {
  requirements: "REQUIREMENTS",
  design: "DESIGN",
  development: "DEVELOPMENT",
  testing: "TESTING",
  cicd: "CICD",
  monitoring: "MONITORING",
};

export async function buildMcpContext(args: {
  organizationId: string;
  keyProjectId: string | null;
  repoUrl?: string;
  workItemKey?: string;
}): Promise<McpResponse> {
  const started = Date.now();

  const project = await resolveProject(args.organizationId, args.keyProjectId, args.repoUrl);

  const [activeRules, projectSkills, adrPlans] = await Promise.all([
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
    db.query.plans.findMany({
      where: and(
        eq(plans.organizationId, project.organizationId),
        eq(plans.projectId, project.id),
        eq(plans.kind, "adr"),
      ),
      orderBy: [desc(plans.updatedAt)],
      limit: 10,
    }),
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

  const guidance = PHASE_GUIDANCE[project.phase];

  const response: McpResponse = {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      phase: PHASE_LABEL[project.phase] ?? project.phase.toUpperCase(),
      url: appUrl(`/projects/${project.id}`),
    },
    workItem: args.workItemKey
      ? {
          key: args.workItemKey,
          title: args.workItemKey,
          url: null,
        }
      : null,
    phaseDiscipline: {
      label: guidance.label,
      description: guidance.description,
      allowed: guidance.allowed,
      forbidden: guidance.forbidden,
      nextCondition: guidance.nextCondition,
    },
    allowedTools: getAllowedTools(project.phase),
    rules: activeRules.map((r) => ({
      id: r.id,
      title: r.title,
      severity: r.severity ?? "warning",
      phase: r.phase,
      url: appUrl(`/rules/${r.id}`),
    })),
    skills: skillsWithAutonomy,
    adrs: adrPlans.map((p) => ({
      id: p.id,
      title: p.title,
      url: appUrl(`/plans/${p.id}`),
    })),
    meta: {
      responseTimeMs: Date.now() - started,
      cacheStatus: "miss" as const,
      computedAt: new Date().toISOString(),
    },
  };
  return response;
}
