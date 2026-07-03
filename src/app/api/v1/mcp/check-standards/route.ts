/**
 * POST /api/v1/mcp/check-standards
 *
 * Proactive rule check — runs project rules against either a proposed
 * plan body or a proposed action *before* it lands. Returns the
 * violation list as advisory; nothing is persisted. The agent uses
 * this to self-correct before calling a write verb.
 *
 * Two input modes (one is required):
 *   - `plan`   — { kind, title, summary, body } → runs keyword-presence
 *   - `action` — { command, paths, fileCount, hasTests, appliesTo } → runs action-policy
 */

import { z } from "zod/v4";

import { PLAN_KINDS, type ProjectTask, type PlanKind } from "@/db/schema/plan/project-task";
import { handleApi } from "@/lib/auth/api-key";
import { httpError, requireProjectScope } from "@/lib/auth/scope";
import { applyActionPolicyRules, evaluatePlanAgainstRules } from "@/operations/rule-engine";

const planCheckSchema = z.object({
  kind: z.enum(PLAN_KINDS),
  title: z.string().min(1),
  summary: z.string().optional().default(""),
  body: z.string().optional().default(""),
});

const actionCheckSchema = z.object({
  appliesTo: z.enum(["skill", "task", "deployment"]),
  command: z.string().optional(),
  paths: z.array(z.string()).optional(),
  fileCount: z.number().int().nonnegative().optional(),
  hasTests: z.boolean().optional(),
});

const bodySchema = z
  .object({
    projectId: z.string().min(1),
    plan: planCheckSchema.optional(),
    action: actionCheckSchema.optional(),
  })
  .refine((v) => v.plan || v.action, {
    message: "Provide either `plan` or `action`.",
  });

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw httpError(400, "Invalid body", parsed.error.issues);
    }

    const project = await requireProjectScope(ctx, parsed.data.projectId);

    const allViolations: Array<{
      ruleId: string;
      ruleTitle: string;
      severity: string;
      message: string;
      validator: "keyword-presence" | "action-policy";
    }> = [];

    if (parsed.data.plan) {
      // Construct a Plan-shaped object with just the fields the validator
      // reads. evaluatePlanAgainstRules pulls projectId + kind for filtering
      // and title/summary/body for evaluation.
      const stubPlan = {
        id: "",
        organizationId: project.organizationId,
        projectId: project.id,
        kind: parsed.data.plan.kind as PlanKind,
        title: parsed.data.plan.title,
        summary: parsed.data.plan.summary,
        body: parsed.data.plan.body,
      } as unknown as ProjectTask;
      const violations = await evaluatePlanAgainstRules(stubPlan);
      allViolations.push(
        ...violations.map((v) => ({ ...v, validator: "keyword-presence" as const })),
      );
    }

    if (parsed.data.action) {
      const violations = await applyActionPolicyRules(
        parsed.data.action.appliesTo,
        {
          command: parsed.data.action.command,
          paths: parsed.data.action.paths,
          fileCount: parsed.data.action.fileCount,
          hasTests: parsed.data.action.hasTests,
        },
        { organizationId: project.organizationId, projectId: project.id },
      );
      allViolations.push(
        ...violations.map((v) => ({ ...v, validator: "action-policy" as const })),
      );
    }

    const errors = allViolations.filter((v) => v.severity === "error");
    const warnings = allViolations.filter((v) => v.severity !== "error");

    return {
      ok: errors.length === 0,
      project: { id: project.id },
      violations: allViolations,
      summary: {
        errors: errors.length,
        warnings: warnings.length,
        total: allViolations.length,
      },
      nextStep:
        errors.length === 0
          ? warnings.length === 0
            ? "No violations. Safe to proceed."
            : `Clean of errors; ${warnings.length} advisory warning(s) recorded. Proceed if intentional.`
          : `${errors.length} error-severity violation(s) — fix before writing.`,
    };
  });
}
