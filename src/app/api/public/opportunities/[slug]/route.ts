import { NextResponse, type NextRequest } from "next/server";
import { getPublicOpportunity } from "@/operations/public";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/opportunities/[slug]
 *
 * Public, unauthenticated. Returns the publicized DTO for the role with
 * this slug, or 404 if the role is private or doesn't exist. Security
 * boundary lives in `src/lib/anonymize/index.ts`.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const dto = await getPublicOpportunity(slug);
  if (!dto) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(dto, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
