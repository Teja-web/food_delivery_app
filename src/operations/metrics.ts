import { z } from "zod/v4";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { metrics, METRIC_TYPES, type MetricType } from "@/db/schema/metric";
import { getActionContext } from "@/lib/auth/context";

const metricSchema = z.object({
  projectId: z.string().optional().nullable(),
  type: z.enum(METRIC_TYPES),
  value: z.number(),
  unit: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  recordedAt: z.date().optional(),
});

export async function recordMetric(input: z.infer<typeof metricSchema>) {
  const ctx = await getActionContext();
  const validated = metricSchema.parse(input);
  const [row] = await db
    .insert(metrics)
    .values({
      organizationId: ctx.organizationId,
      projectId: validated.projectId ?? null,
      type: validated.type,
      value: validated.value,
      unit: validated.unit,
      metadata: validated.metadata,
      recordedAt: validated.recordedAt ?? new Date(),
    })
    .returning({ id: metrics.id });
  return row.id;
}

export async function listMetrics(opts: {
  projectId?: string;
  type?: MetricType;
  since?: Date;
  limit?: number;
}) {
  const ctx = await getActionContext();
  const conditions = [eq(metrics.organizationId, ctx.organizationId)];
  if (opts.projectId) conditions.push(eq(metrics.projectId, opts.projectId));
  if (opts.type) conditions.push(eq(metrics.type, opts.type));
  if (opts.since) conditions.push(gte(metrics.recordedAt, opts.since));

  return db.query.metrics.findMany({
    where: and(...conditions),
    orderBy: [desc(metrics.recordedAt)],
    limit: opts.limit ?? 200,
  });
}
