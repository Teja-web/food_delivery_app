import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deployments, DEPLOYMENT_STATUSES, type Deployment } from "@/db/schema/deployment";
import { metrics } from "@/db/schema/metric";
import { getActionContext } from "@/lib/auth/context";
import { recordMttrForRollback, recordMttrForSuccess } from "@/operations/dora/mttr";

const deploymentSchema = z.object({
  projectId: z.string().min(1),
  planArtifactId: z.string().optional().nullable(),
  environment: z.string().min(1),
  version: z.string().min(1),
  commitSha: z.string().optional(),
  status: z.enum(DEPLOYMENT_STATUSES).default("pending"),
  deployedById: z.string().optional(),
  deployedByName: z.string().optional(),
  ciRunUrl: z.string().url().optional(),
  notes: z.string().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  rolledBackAt: z.date().optional(),
  rolledBackReason: z.string().optional(),
});

async function recordDeploymentMetrics(d: Deployment): Promise<void> {
  if (d.status === "success") {
    await db.insert(metrics).values({
      organizationId: d.organizationId,
      projectId: d.projectId,
      type: "deployment_frequency",
      value: 1,
      unit: "deploy",
      metadata: { environment: d.environment, version: d.version, deploymentId: d.id },
      recordedAt: d.completedAt ?? new Date(),
    });
  } else if (d.status === "failed" || d.status === "rolled_back") {
    await db.insert(metrics).values({
      organizationId: d.organizationId,
      projectId: d.projectId,
      type: "change_failure_rate",
      value: 1,
      unit: "failure",
      metadata: { environment: d.environment, version: d.version, deploymentId: d.id, status: d.status },
      recordedAt: d.completedAt ?? d.rolledBackAt ?? new Date(),
    });
  }
}

export async function recordDeployment(input: z.infer<typeof deploymentSchema>): Promise<Deployment> {
  const ctx = await getActionContext();
  const validated = deploymentSchema.parse(input);
  const [row] = await db
    .insert(deployments)
    .values({
      organizationId: ctx.organizationId,
      projectId: validated.projectId,
      planArtifactId: validated.planArtifactId ?? null,
      environment: validated.environment,
      version: validated.version,
      commitSha: validated.commitSha,
      status: validated.status,
      deployedById: validated.deployedById,
      deployedByName: validated.deployedByName,
      ciRunUrl: validated.ciRunUrl,
      notes: validated.notes,
      raw: validated.raw,
      startedAt: validated.startedAt ?? new Date(),
      completedAt: validated.completedAt,
      rolledBackAt: validated.rolledBackAt,
      rolledBackReason: validated.rolledBackReason,
    })
    .returning();
  await recordDeploymentMetrics(row);
  // MTTR: rollback closes the incident in place; success closes the most
  // recent open incident in the same lane (project + environment).
  if (row.status === "rolled_back") {
    await recordMttrForRollback(row);
  } else if (row.status === "success") {
    await recordMttrForSuccess(row);
  }
  return row;
}

export async function updateDeploymentStatus(
  id: string,
  status: typeof DEPLOYMENT_STATUSES[number],
  fields: Partial<Pick<Deployment, "completedAt" | "rolledBackAt" | "rolledBackReason" | "notes">> = {},
): Promise<Deployment> {
  const ctx = await getActionContext();
  const [row] = await db
    .update(deployments)
    .set({ status, ...fields })
    .where(and(eq(deployments.id, id), eq(deployments.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new Error("Deployment not found");
  await recordDeploymentMetrics(row);
  if (row.status === "rolled_back") {
    await recordMttrForRollback(row);
  } else if (row.status === "success") {
    await recordMttrForSuccess(row);
  }
  return row;
}

export async function listDeployments(opts: { projectId?: string; environment?: string; limit?: number }) {
  const ctx = await getActionContext();
  const conditions = [eq(deployments.organizationId, ctx.organizationId)];
  if (opts.projectId) conditions.push(eq(deployments.projectId, opts.projectId));
  if (opts.environment) conditions.push(eq(deployments.environment, opts.environment));
  return db.query.deployments.findMany({
    where: and(...conditions),
    orderBy: [desc(deployments.startedAt)],
    limit: opts.limit ?? 50,
  });
}
