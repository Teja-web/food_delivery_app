import { and, eq } from "drizzle-orm";
import { marked } from "marked";

import { db } from "@/db/client";
import { planArtifacts as plans } from "@/db/schema/plan/plan-artifact";
import { projects } from "@/db/schema/project";
import { authenticate, UnauthorizedError } from "@/lib/auth/api-key";
import { getCurrentUser } from "@/lib/auth/actions";
import { serializePlanToMarkdown } from "@/domain/plan-markdown";

/**
 * Dual-auth: try Bearer (agent surface); if missing, fall back to the
 * Better Auth session cookie (browser surface). Returns the org id or
 * null if neither resolves.
 */
async function resolveOrganizationId(req: Request): Promise<string | null> {
  try {
    const apiCtx = await authenticate(req);
    return apiCtx.organizationId;
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) throw err;
  }
  const { organizationId } = await getCurrentUser();
  return organizationId ?? null;
}

const ALLOWED_FORMATS = ["md", "html"] as const;
type ExportFormat = (typeof ALLOWED_FORMATS)[number];

/**
 * GET /api/v1/plans/:id/export?format=md|html
 *
 * Downloadable audit-export of a plan. Distinct from `/markdown` (which
 * serves inline for repo-mirroring). This one sets
 * `Content-Disposition: attachment` so a browser save-as is the default.
 *
 * - `md`   text/markdown — plan body with YAML frontmatter.
 * - `html` text/html — same content rendered with `marked`, wrapped in a
 *          minimal printable document. Word opens this directly, and
 *          Chrome's print dialog produces a PDF.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const url = new URL(req.url);
  const formatParam = url.searchParams.get("format") ?? "md";
  if (!ALLOWED_FORMATS.includes(formatParam as ExportFormat)) {
    return new Response(`Unsupported format: ${formatParam}. Allowed: ${ALLOWED_FORMATS.join(", ")}`, {
      status: 400,
    });
  }
  const format = formatParam as ExportFormat;

  const organizationId = await resolveOrganizationId(req);
  if (!organizationId) return new Response("Unauthorized", { status: 401 });

  const plan = await db.query.planArtifacts.findFirst({
    where: and(eq(plans.id, id), eq(plans.organizationId, organizationId)),
  });
  if (!plan) return new Response("Plan not found", { status: 404 });

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, plan.projectId),
    columns: { slug: true, name: true },
  });

  const md = serializePlanToMarkdown(plan, { project: project ?? undefined });
  const baseName = (plan.slug && plan.slug.length > 0 ? plan.slug : plan.id).replace(/[^a-zA-Z0-9._-]/g, "-");
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `${plan.kind}-${baseName}-${dateStamp}.${format}`;

  if (format === "md") {
    return new Response(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const bodyHtml = await marked.parse(md, { gfm: true, breaks: false });
  const html = renderHtmlDocument({
    title: plan.title,
    kind: plan.kind,
    projectName: project?.name ?? null,
    bodyHtml,
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtmlDocument(opts: {
  title: string;
  kind: string;
  projectName: string | null;
  bodyHtml: string;
}): string {
  const subtitle = [opts.projectName, opts.kind].filter(Boolean).join(" · ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(opts.title)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 7.5in; margin: 1in auto; color: #111; line-height: 1.5; }
  header { border-bottom: 1px solid #999; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
  header .subtitle { font-size: 0.85rem; color: #666; text-transform: uppercase; letter-spacing: 0.08em; }
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
  @media print {
    body { margin: 0.5in; }
    pre, blockquote, table { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<header>
  <div class="subtitle">${escapeHtml(subtitle)}</div>
  <h1>${escapeHtml(opts.title)}</h1>
</header>
<main>
${opts.bodyHtml}
</main>
</body>
</html>
`;
}
