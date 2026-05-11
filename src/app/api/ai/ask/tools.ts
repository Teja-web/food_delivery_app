/**
 * Ask AI Tools
 *
 * Auto-generated entity tools from CRUD .search() + .get()
 * Plus custom insight tools for aggregate analytics.
 */

import { z } from "zod";
import { createTool } from "./create-tool";
import { createEntityTools } from "@/lib/ai/entity-tools";

// -- CRUD operations ----------------------------------------------------------

import { searchCandidates, getCandidateDetail } from "@/operations/candidates";
import { searchRoles, getRoleDetail } from "@/operations/roles";
import { searchInterviews, getInterview } from "@/operations/interviews";
import { searchOffers, getOffer } from "@/operations/offers";
import { searchPools, getPoolDetail } from "@/operations/pools";
import { searchPipelineEntries, getApplication } from "@/operations/applications";
import { searchAssessments, getAssessment } from "@/operations/assessments";

// -- Insight operations -------------------------------------------------------

import {
  getPipelineHealth,
  getHiringVelocity,
  getSourceEffectiveness,
  getBottlenecks,
} from "@/operations/insights";
import { getActionContext } from "@/lib/auth/context";
import { executeNlRead } from "@/lib/ai/nl-read";
// -- Entity tools (auto-generated from CRUD) ----------------------------------

const entityTools = createEntityTools([
  {
    entity: "candidate",
    displayName: "Candidate",
    getter: (id) => getCandidateDetail(id),
    searcher: searchCandidates,
    getDescription:
      "Get a candidate by ID. Returns full profile, skills, experience, applications (with role and match score), and matches. Use when you have a candidate ID.",
    searchDescription:
      "Search candidates by name, email, location, job title, company, or resume text. Returns matching candidates ranked by relevance. Does NOT filter by role — use getRole to see a role's pipeline.",
  },
  {
    entity: "role",
    displayName: "Role",
    getter: (id) => getRoleDetail(id),
    searcher: searchRoles,
    getDescription:
      "Get a role by ID. Returns role details plus two separate lists: (1) 'applications' — the actual hiring pipeline, i.e. candidates who have applied and are being evaluated (each with candidate, match score, interviews, and scorecards), and (2) 'matches' — AI-suggested candidates who may NOT have applied yet. When asked about pipeline or active candidates, use only 'applications'. When asked about recommended or potential candidates, use 'matches'.",
    searchDescription:
      "Search roles by title, team, department, location, description, or business case. Returns matching roles ranked by relevance.",
  },
  {
    entity: "interview",
    displayName: "Interview",
    getter: getInterview,
    searcher: searchInterviews,
    getDescription:
      "Get an interview by ID with full details including scorecards and panelists.",
    searchDescription:
      "Search interviews by type, notes, or transcript content. Returns matching interviews ranked by relevance.",
  },
  {
    entity: "offer",
    displayName: "Offer",
    getter: getOffer,
    searcher: searchOffers,
    getDescription:
      "Get an offer by ID with compensation details, status, and recommendation.",
    searchDescription:
      "Search offers by recommendation text or compensation. Returns matching offers ranked by relevance.",
  },
  {
    entity: "pool",
    displayName: "Talent Pool",
    getter: (id) => getPoolDetail(id),
    searcher: searchPools,
    getDescription:
      "Get a talent pool by ID with members and pool health metrics.",
    searchDescription:
      "Search talent pools by name or description. Returns matching pools ranked by relevance.",
  },
  {
    entity: "application",
    displayName: "Application",
    getter: (id) => getApplication(id),
    searcher: searchPipelineEntries,
    getDescription:
      "Get an application by ID. Returns the application with its related role, candidate, match score, interviews, and offers. An application represents a candidate's journey through a role's hiring pipeline.",
    searchDescription:
      "Search applications by source. Very limited — prefer getRole to see all applications for a role, or getCandidate to see all applications for a candidate.",
  },
  {
    entity: "assessment",
    displayName: "Assessment",
    getter: (id) => getAssessment(id),
    searcher: searchAssessments,
    getDescription:
      "Get an assessment by ID with questions and all attempts.",
    searchDescription:
      "Search assessments by title or description. Returns matching assessments ranked by relevance.",
  },
]);

// -- Custom insight tools (aggregate queries, not entity CRUD) ----------------

const insightTools = {
  getPipelineStats: createTool({
    description:
      "Get pipeline health metrics — active candidates, conversion rate, open roles.",
    inputSchema: z.object({}),
    execute: async () => {
      const ctx = await getActionContext();
      if (!ctx?.organizationId)
        return { error: "Unable to determine organization context" };
      return getPipelineHealth(ctx.organizationId);
    },
  }),

  getHiringMetrics: createTool({
    description:
      "Get hiring velocity metrics — average time to fill, source effectiveness, performance by role.",
    inputSchema: z.object({}),
    execute: async () => {
      const ctx = await getActionContext();
      if (!ctx?.organizationId)
        return { error: "Unable to determine organization context" };
      const [velocity, sources] = await Promise.all([
        getHiringVelocity(ctx.organizationId),
        getSourceEffectiveness(ctx.organizationId),
      ]);
      return { velocity, sources };
    },
  }),

  getHiringBottlenecks: createTool({
    description:
      "Identify bottlenecks in the hiring process — stalled pipelines, roles at risk.",
    inputSchema: z.object({}),
    execute: async () => {
      const ctx = await getActionContext();
      if (!ctx?.organizationId)
        return { error: "Unable to determine organization context" };
      const bottlenecks = await getBottlenecks(ctx.organizationId);
      return { bottlenecks, count: bottlenecks.length };
    },
  }),
};

// -- NL Read (natural language → SQL for ad-hoc queries) ----------------------

const nlReadTool = {
  queryData: createTool({
    description:
      "Query the database directly using natural language. Best tool for: cross-entity questions (e.g. 'which candidates have interviews this week'), aggregations and counts, filtering by specific conditions, time-based analysis, and comparisons across roles or candidates. Also use when other tools return too much data and you need a precise filter. Generates a read-only SQL query.",
    inputSchema: z.object({
      question: z
        .string()
        .describe(
          "The analytical question to answer, e.g. 'How many candidates applied last week?' or 'Which roles have no applications?'",
        ),
    }),
    execute: async ({ question }) => {
      const ctx = await getActionContext();
      if (!ctx?.organizationId)
        return { error: "Unable to determine organization context" };
      const result = await executeNlRead({
        question,
        organizationId: ctx.organizationId,
      });
      if (!result.success) return { error: result.error };
      return {
        data: result.rows,
        rowCount: result.rowCount,
        explanation: result.explanation,
      };
    },
  }),
};

// -- Export all tools ----------------------------------------------------------

export const allTools = {
  ...entityTools,
  ...insightTools,
  ...nlReadTool,
};
