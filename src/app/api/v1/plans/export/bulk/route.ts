/**
 * GET /api/v1/plans/export/bulk?ids=a,b,c&format=md|html
 *
 * Bundle several plans into one downloadable artifact — the evidence-packet
 * flow for Priya's CISO drill. Reuses `serializePlanToMarkdown` per plan
 * and concatenates with separators. `format=html` renders via `marked`
 * with the same print stylesheet as the single-plan export route.
 *
 * Dual-auth: Bearer (agent) or session cookie (browser click from /approvals).
 */

import { and, eq, inArray } from "drizzle-orm";
import { marked } from "marked";

import { db } from "@/db/client";
import { plans } from "@/db/schema/plan/plan";
import { projects } from "@/db/schema/project";
import { authenticate, UnauthorizedError } from "@/lib/auth/api-key";
import { getCurrentUser } from "@/lib/auth/actions";
import { serializePlanToMarkdown } from "@/domain/plan-markdown";

const ALLOWED_FORMATS = ["md", "html"] as const;
type ExportFormat = (typeof ALLOWED_FORMATS)[number];

interface AuthScope {
  organizationId: string;
  /** Non-null when authenticated via a project-scoped API key — caller may only export plans for this project. */
  projectId: string | null;
}

async function resolveAuthScope(req: Request): Promise<AuthScope | null> {
  try {
    const apiCtx = await authenticate(req);
    return { organizationId: apiCtx.organizationId, projectId: apiCtx.projectId ?? null };
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) throw err;
  }
  const { organizationId } = await getCurrentUser();
  return organizationId ? { organizationId, projectId: null } : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const formatParam = url.searchParams.get("format") ?? "md";
  if (!ALLOWED_FORMATS.includes(formatParam as ExportFormat)) {
    return new Response(`Unsupported format: ${formatParam}. Allowed: ${ALLOWED_FORMATS.join(", ")}`, {
      status: 400,
    });
  }
  const format = formatParam as ExportFormat;

  const rawIds = url.searchParams.get("ids");
  if (!rawIds) return new Response("`ids` query param is required (comma-separated plan ids)", { status: 400 });
  const ids = rawIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return new Response("No plan ids provided", { status: 400 });
  if (ids.length > 200) return new Response("Too many ids (max 200)", { status: 400 });

  const auth = await resolveAuthScope(req);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  // Project-scoped API keys may only fetch plans from their bound project.
  // Cross-project rows are silently filtered out — same behavior as cross-org
  // leakage below.
  const conditions = [inArray(plans.id, ids), eq(plans.organizationId, auth.organizationId)];
  if (auth.projectId) conditions.push(eq(plans.projectId, auth.projectId));

  const rows = await db.query.plans.findMany({
    where: and(...conditions),
  });

  if (rows.length === 0) return new Response("No plans found for the given ids in this org", { status: 404 });

  const projectIds = Array.from(new Set(rows.map((p) => p.projectId)));
  const projectRows = await db.query.projects.findMany({
    where: and(inArray(projects.id, projectIds), eq(projects.organizationId, auth.organizationId)),
    columns: { id: true, slug: true, name: true },
  });
  const projectById = new Map(projectRows.map((p) => [p.id, p]));

  // Preserve caller-supplied order. Filter out ids that didn't resolve (e.g.
  // cross-org leakage attempts) — they just drop out silently.
  const orderedPlans = ids
    .map((id) => rows.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `plans-bundle-${dateStamp}.${format}`;

  if (format === "md") {
    const md = orderedPlans
      .map((plan) => serializePlanToMarkdown(plan, { project: projectById.get(plan.projectId) ?? undefined }))
      .join("\n\n---\n\n");
    return new Response(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Coznt-Plan-Count": String(orderedPlans.length),
      },
    });
  }

  const sections: string[] = [];
  for (const plan of orderedPlans) {
    const project = projectById.get(plan.projectId);
    const md = serializePlanToMarkdown(plan, { project });
    const bodyHtml = await marked.parse(md, { gfm: true, breaks: false });
    sections.push(
      `<section class="plan">`,
      `<header><div class="subtitle">${escapeHtml([project?.name ?? "", plan.kind].filter(Boolean).join(" · "))}</div>`,
      `<h1>${escapeHtml(plan.title)}</h1></header>`,
      bodyHtml,
      `</section>`,
    );
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Plans bundle ${dateStamp}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 7.5in; margin: 1in auto; color: #111; line-height: 1.5; }
  section.plan { page-break-after: always; }
  section.plan:last-child { page-break-after: auto; }
  section.plan > header { border-bottom: 1px solid #999; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
  section.plan > header .subtitle { font-size: 0.85rem; color: #666; text-transform: uppercase; letter-spacing: 0.08em; }
  h1, h2, h3, h4 { color: #000; }
  h1 { font-size: 1.8rem; margin: 0; }
  h2 { font-size: 1.3rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.2rem; }
  h3 { font-size: 1.1rem; margin-top: 1.5rem; }
  pre, code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 0.85rem; }
  pre { background: #f4f4f5; padding: 0.75rem; overflow-x: auto; border-radius: 4px; }
  code { background: #f4f4f5; padding: 0.1rem 0.3rem; border-radius: 3px; }
  pre code { background: transparent; padding: 0; }
  table { border-collapse: collapse; margin: 1rem 0; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
  th { background: #f4f4f5; }
  blockquote { border-left: 3px solid #999; padding-left: 0.75rem; color: #555; margin-left: 0; }
  hr { border: none; border-top: 1px solid #ccc; margin: 1.5rem 0; }
  @media print { body { margin: 0.5in; } pre, blockquote, table { page-break-inside: avoid; } }
</style>
</head>
<body>
${sections.join("\n")}
</body>
</html>
`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Coznt-Plan-Count": String(orderedPlans.length),
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
