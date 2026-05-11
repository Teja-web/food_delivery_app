"use server";

import { generate } from "@/lib/ai";
import { candidateComparerAgent, candidateComparisonSchema } from "@/automations/agents/definitions/candidate-comparer";
import { candidateComparerPromptWithContext } from "@/automations/agents/prompts/candidate-comparer";
import { db } from "@/db/client";
import { roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { RoleCriteriaConfig } from "@/db/schema/roles";

interface CompareCandidate {
  candidateId: string;
  name: string;
  fitScore: number | null;
  alignment: Array<{ criterion: string; rating: string; weight: string | null; evidence?: string }>;
  signal: string | null;
  gaps: string[];
  summary: string | null;
  recommendation: string | null;
}

export async function compareCandidates(roleId: string, candidates: CompareCandidate[]) {
  // Fetch role criteria for context
  const role = await db.query.roles.findFirst({
    where: eq(roles.id, roleId),
    columns: { title: true, criteriaConfig: true },
  });

  if (!role) throw new Error("Role not found");

  const config = role.criteriaConfig as RoleCriteriaConfig | null;
  const criteriaText = config?.criteria
    ?.map((c) => `- ${c.name} [${c.weight}]: ${c.description}`)
    .join("\n") ?? "No criteria configured";

  const prompt = candidateComparerPromptWithContext({
    roleTitle: role.title,
    roleCriteria: criteriaText,
    candidates,
  });

  const result = await generate({
    agent: candidateComparerAgent,
    prompt,
    output: candidateComparisonSchema,
  });

  return result.object;
}
