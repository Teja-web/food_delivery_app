/**
 * NL Read — natural language → SQL query engine for complex multi-table reads.
 *
 * Given a natural language question and schema context, generates a parameterized
 * SELECT statement. AST validation ensures only SELECT on coznt.* schema.
 */

import { generate } from "./index";
import { z } from "zod/v4";
import { executeSQLQuery } from "../sql";
import { RECRUIT_SCHEMA_CONTEXT, RECRUIT_TABLES } from "../sql/schema-context";

const nlReadAgent = {
  slug: "nl-read",
  name: "NL Read Engine",
  temperature: 0,
  systemPrompt: `You are a SQL generation engine for Coznt, the AI-DLC governance + observability layer.
Given a natural language question and the database schema context below, generate a single SELECT statement that answers the question.

RULES:
- Only generate SELECT statements — never INSERT, UPDATE, DELETE, or DDL
- Only query tables in the "coznt" schema
- Use parameterized values ($1, $2, etc.) for all user-supplied filter values
- Return the SQL, parameter values, and a brief explanation separately
- Always include organization_id filtering via a parameter ($1 is always organization_id)
- Use JOINs when the question involves multiple entities (e.g. "skills with low autonomy for project X" needs skills + skill_autonomy + projects)
- Always include a LIMIT clause (default 100, respect user's request if specified)
- Prefer LEFT JOIN over INNER JOIN unless the question implies only matched rows
- For aggregate questions (counts, averages), return the aggregated result
- Use descriptive column aliases for computed columns

${RECRUIT_SCHEMA_CONTEXT}`,
};

const nlReadOutputSchema = z.object({
  sql: z.string().describe("The parameterized SELECT statement"),
  params: z.array(z.string()).describe("Parameter values in order ($1 is always organization_id, then $2, $3, ...)"),
  explanation: z.string().describe("Brief explanation of what this query does and why these JOINs are used"),
  columns: z.array(z.string()).describe("Column names/aliases in the result set"),
});

export async function executeNlRead(params: {
  question: string;
  organizationId: string;
  entityContext?: string;
  limit?: number;
  dryRun?: boolean;
}): Promise<{
  success: boolean;
  rows?: Record<string, unknown>[];
  sql?: string;
  params?: string[];
  explanation?: string;
  columns?: string[];
  rowCount?: number;
  error?: string;
}> {
  const { question, organizationId, entityContext, limit, dryRun } = params;

  const prompt = [
    `Organization ID parameter: $1 = ${organizationId}`,
    entityContext ? `Context: ${entityContext}` : null,
    limit ? `Row limit: ${limit}` : null,
    `Question: ${question}`,
    "",
    "Generate the SELECT statement to answer this question.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generate({
      agent: nlReadAgent,
      prompt,
      output: nlReadOutputSchema,
    });
    const output = (result as any).object as z.infer<typeof nlReadOutputSchema>;

    // CRITICAL: Validate org isolation - $1 must be used and must equal organizationId
    // This prevents the LLM from generating queries that bypass org filtering
    const usesOrgParam = /\$1\b/.test(output.sql);
    const firstParamIsOrgId = output.params[0] === organizationId;

    if (!usesOrgParam) {
      return {
        success: false,
        error: "Query rejected: organization_id filtering is required but $1 parameter is not used in the query",
      };
    }

    if (!firstParamIsOrgId) {
      // Force $1 to be the organizationId regardless of what LLM generated
      output.params[0] = organizationId;
    }

    // AST validation: SELECT only, coznt schema only
    const execResult = await executeSQLQuery(output.sql, {
      validation: {
        allowSelect: true,
        allowUpdate: false,
        allowInsert: false,
        allowDelete: false,
        allowedTables: [...RECRUIT_TABLES],
        requiredSchema: "coznt",
      },
      params: output.params,
      dryRun: dryRun ?? false,
      maxRows: limit ?? 100,
    });

    return {
      success: true,
      rows: execResult.rows,
      sql: output.sql,
      params: output.params,
      explanation: output.explanation,
      columns: output.columns,
      rowCount: execResult.rowCount,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
