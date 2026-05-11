import { NextResponse, type NextRequest } from "next/server";
import { listPublicOpportunities } from "@/operations/public";
import {
  INDUSTRY_VALUES,
  REGION_VALUES,
  STAGE_VALUES,
  type Industry,
  type Region,
  type Stage,
} from "@/lib/anonymize/taxonomy";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/opportunities
 *
 * Public, unauthenticated. Returns anonymized or fully-public DTOs. The
 * security boundary is `publicizeRole` in `src/lib/anonymize/index.ts` —
 * this route is a thin transport layer.
 *
 * Query params (all optional):
 *   - q: title search
 *   - region, industry, stage: comma-separated bucket values
 *   - offset: integer, default 0
 *   - limit: integer, default 25, max 100
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const region = pickEnum(url.searchParams.getAll("region"), REGION_VALUES);
  const industry = pickEnum(url.searchParams.getAll("industry"), INDUSTRY_VALUES);
  const stage = pickEnum(url.searchParams.getAll("stage"), STAGE_VALUES);
  const q = url.searchParams.get("q") ?? undefined;

  const offset = parseIntSafe(url.searchParams.get("offset"), 0);
  const limit = parseIntSafe(url.searchParams.get("limit"), 25);

  const result = await listPublicOpportunities({
    q,
    region: region as Region[] | undefined,
    industry: industry as Industry[] | undefined,
    stage: stage as Stage[] | undefined,
    offset,
    limit,
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

function pickEnum(raw: string[], allowed: readonly string[]): string[] | undefined {
  // Each searchParam value may be comma-joined ("a,b,c").
  const split = raw.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  const clean = split.filter((v) => (allowed as readonly string[]).includes(v));
  return clean.length > 0 ? clean : undefined;
}

function parseIntSafe(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
