import { handleApi } from "@/lib/api/auth";
import { updateDeploymentStatus } from "@/operations/deployments";
import { DEPLOYMENT_STATUSES, type DeploymentStatus } from "@/db/schema/deployment";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(req, async () => {
    const body = await req.json();
    const status = body?.status as DeploymentStatus;
    if (!DEPLOYMENT_STATUSES.includes(status)) {
      const err = new Error(`Unknown status: ${status}`) as Error & { status?: number };
      err.status = 400;
      throw err;
    }
    return updateDeploymentStatus(id, status, {
      completedAt: body.completedAt ? new Date(body.completedAt) : undefined,
      rolledBackAt: body.rolledBackAt ? new Date(body.rolledBackAt) : undefined,
      rolledBackReason: body.rolledBackReason,
      notes: body.notes,
    });
  });
}
