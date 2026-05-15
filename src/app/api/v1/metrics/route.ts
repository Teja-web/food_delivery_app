import { handleApi } from "@/lib/auth/api-key";
import { recordMetric, listMetrics } from "@/operations/metrics";
import { METRIC_TYPES, type MetricType } from "@/db/schema/metric";

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const body = await req.json();
    const id = await recordMetric({
      projectId: body.projectId ?? ctx.projectId,
      type: body.type,
      value: Number(body.value),
      unit: body.unit,
      metadata: body.metadata,
      recordedAt: body.recordedAt ? new Date(body.recordedAt) : undefined,
    });
    return { id };
  });
}

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") as MetricType | null;
    if (type && !METRIC_TYPES.includes(type)) {
      const err = new Error(`Unknown metric type: ${type}`) as Error & { status?: number };
      err.status = 400;
      throw err;
    }
    const sinceParam = url.searchParams.get("since");
    return {
      items: await listMetrics({
        projectId: url.searchParams.get("projectId") ?? ctx.projectId ?? undefined,
        type: type ?? undefined,
        since: sinceParam ? new Date(sinceParam) : undefined,
        limit: Number(url.searchParams.get("limit") ?? 200),
      }),
    };
  });
}
