import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { testRuns, TEST_RUN_STATUSES, type TestRun } from "@/db/schema/test-run";
import { metrics } from "@/db/schema/metric";
import { getActionContext } from "@/lib/auth/context";

const testRunSchema = z.object({
  projectId: z.string().min(1),
  projectTaskId: z.string().optional().nullable(),
  suite: z.string().optional(),
  commitSha: z.string().optional(),
  branch: z.string().optional(),
  status: z.enum(TEST_RUN_STATUSES),
  total: z.number().int().nonnegative().default(0),
  passed: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
  skipped: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().optional(),
  coverage: z.number().min(0).max(1).optional(),
  ciRunUrl: z.string().url().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
  ranAt: z.date().optional(),
});

export async function recordTestRun(input: z.infer<typeof testRunSchema>): Promise<TestRun> {
  const ctx = await getActionContext();
  const validated = testRunSchema.parse(input);
  const [row] = await db
    .insert(testRuns)
    .values({
      organizationId: ctx.organizationId,
      ...validated,
      projectTaskId: validated.projectTaskId ?? null,
      ranAt: validated.ranAt ?? new Date(),
    })
    .returning();

  if (typeof validated.coverage === "number") {
    await db.insert(metrics).values({
      organizationId: ctx.organizationId,
      projectId: validated.projectId,
      type: "test_coverage",
      value: validated.coverage,
      unit: "ratio",
      metadata: { suite: validated.suite, commitSha: validated.commitSha, testRunId: row.id },
      recordedAt: row.ranAt,
    });
  }

  return row;
}

export async function listTestRuns(opts: { projectId?: string; projectTaskId?: string; limit?: number }) {
  const ctx = await getActionContext();
  const conditions = [eq(testRuns.organizationId, ctx.organizationId)];
  if (opts.projectId) conditions.push(eq(testRuns.projectId, opts.projectId));
  if (opts.projectTaskId) conditions.push(eq(testRuns.projectTaskId, opts.projectTaskId));
  return db.query.testRuns.findMany({
    where: and(...conditions),
    orderBy: [desc(testRuns.ranAt)],
    limit: opts.limit ?? 50,
  });
}
