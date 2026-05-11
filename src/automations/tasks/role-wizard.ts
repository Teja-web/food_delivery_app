/**
 * role-wizard — Unified role creation assistant.
 * Extracts from documents, generates criteria, designs interview plans.
 */

import { generate } from "@/lib/ai";
import { roleWizardAgent, roleWizardSchema, type RoleWizardOutput } from "../agents/definitions/role-wizard";
import { roleWizardPromptWithContext, type RoleWizardContext } from "../agents/prompts/role-wizard";

export async function runRoleWizard(ctx: RoleWizardContext): Promise<RoleWizardOutput> {
  // Truncate very long documents
  if (ctx.documentText && ctx.documentText.length > 15_000) {
    ctx = { ...ctx, documentText: ctx.documentText.slice(0, 15_000) };
  }

  const prompt = roleWizardPromptWithContext(ctx);
  const { object } = await generate({
    agent: roleWizardAgent,
    prompt,
    output: roleWizardSchema,
  });

  return object;
}
