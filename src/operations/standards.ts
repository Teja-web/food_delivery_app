import { createHash } from "node:crypto";

import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema/audit/audit-log";
import {
  REQUIRED_STANDARD_KINDS,
  STANDARD_FORMATS,
  STANDARD_KIND_LABELS,
  STANDARD_KINDS,
  standards,
  type RequiredStandardKind,
  type Standard,
  type StandardFormat,
  type StandardKind,
} from "@/db/schema/standard";
import { projects } from "@/db/schema/project";
import { assertElevatedRole, getActionContext } from "@/lib/auth/context";
import { safeRevalidate } from "@/lib/safe-revalidate";

export {
  REQUIRED_STANDARD_KINDS,
  STANDARD_KIND_LABELS,
  STANDARD_UPLOAD_FIELDS,
} from "@/db/schema/standard";

export type StandardScope = "org" | "project";

export interface StandardManifestEntry {
  id: string;
  kind: StandardKind;
  slug: string;
  title: string;
  format: StandardFormat;
  version: string;
  hash: string;
  scope: StandardScope;
  sourceStandardId: string;
  sourceFileName: string | null;
  updatedAt: string;
  resourceUri: string;
}

export interface StandardBundleEntry extends StandardManifestEntry {
  content: string;
}

export interface StandardsManifest {
  standards: StandardManifestEntry[];
  missingRequired: RequiredStandardKind[];
  requiredComplete: boolean;
  manifestHash: string;
}

export interface StandardsBundle extends StandardsManifest {
  standards: StandardBundleEntry[];
}

export class MissingRequiredStandardsError extends Error {
  status = 409;
  constructor(public readonly missing: RequiredStandardKind[]) {
    super(
      `Required organization standards are missing: ${missing
        .map((kind) => STANDARD_KIND_LABELS[kind])
        .join(", ")}.`,
    );
    this.name = "MissingRequiredStandardsError";
  }
}

const standardInputSchema = z.object({
  projectId: z.string().optional().nullable(),
  kind: z.enum(STANDARD_KINDS),
  slug: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  body: z.string().min(1),
  format: z.enum(STANDARD_FORMATS).default("markdown"),
  version: z.string().min(1).default("1.0.0"),
  sourceFileName: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

export type UpsertStandardInput = z.input<typeof standardInputSchema>;

function canonicalManifestHash(entries: { slug: string; hash: string; scope: StandardScope }[]): string {
  const canonical = [...entries]
    .sort((a, b) => `${a.scope}:${a.slug}`.localeCompare(`${b.scope}:${b.slug}`))
    .map((entry) => `${entry.scope}:${entry.slug}:${entry.hash}`)
    .join("\n");
  return hashStandardBody(canonical);
}

function isRequiredKind(kind: StandardKind): kind is RequiredStandardKind {
  return (REQUIRED_STANDARD_KINDS as readonly string[]).includes(kind);
}

function activeStandardPredicate(organizationId: string, projectId?: string | null) {
  return and(
    eq(standards.organizationId, organizationId),
    eq(standards.enabled, true),
    isNull(standards.deletedAt),
    projectId === undefined
      ? undefined
      : projectId === null
        ? isNull(standards.projectId)
        : eq(standards.projectId, projectId),
  );
}

function scopeOf(row: Pick<Standard, "projectId">): StandardScope {
  return row.projectId ? "project" : "org";
}

function standardPathSlug(row: Pick<Standard, "kind" | "slug">): string {
  return row.kind === "custom" ? row.slug : row.kind;
}

function toManifestEntry(row: Standard): StandardManifestEntry {
  return {
    id: row.id,
    kind: row.kind,
    slug: standardPathSlug(row),
    title: row.title,
    format: row.format,
    version: row.version,
    hash: row.contentHash,
    scope: scopeOf(row),
    sourceStandardId: row.id,
    sourceFileName: row.sourceFileName,
    updatedAt: row.updatedAt.toISOString(),
    resourceUri: "coznt://standards",
  };
}

function auditShape(row: Standard) {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    scope: scopeOf(row),
    projectId: row.projectId,
    version: row.version,
    contentHash: row.contentHash,
    enabled: row.enabled,
  };
}

async function auditStandardMutation(input: {
  organizationId: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  standard: Standard;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  summary: string;
  invokedVia: string;
}) {
  await db.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorId,
    actorName: input.actorName,
    action: input.action,
    entityType: "standard",
    entityId: input.standard.id,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
    invokedVia: input.invokedVia,
  });
}

export function hashStandardBody(body: string): string {
  return createHash("sha256").update(body, "utf-8").digest("hex");
}

export async function listOrgStandards(): Promise<Standard[]> {
  const ctx = await getActionContext();
  return db.query.standards.findMany({
    where: activeStandardPredicate(ctx.organizationId, null),
    orderBy: [asc(standards.kind), asc(standards.title)],
  });
}

export async function listProjectStandards(projectId: string): Promise<Standard[]> {
  const ctx = await getActionContext();
  return db.query.standards.findMany({
    where: activeStandardPredicate(ctx.organizationId, projectId),
    orderBy: [asc(standards.kind), asc(standards.title)],
  });
}

export async function getOrgStandardsReadiness(organizationId?: string): Promise<{
  requiredComplete: boolean;
  missingRequired: RequiredStandardKind[];
  presentRequired: RequiredStandardKind[];
}> {
  const orgId = organizationId ?? (await getActionContext()).organizationId;
  const rows = await db.query.standards.findMany({
    where: activeStandardPredicate(orgId, null),
    columns: { kind: true },
  });
  const present = new Set(rows.map((row) => row.kind).filter(isRequiredKind));
  const missingRequired = REQUIRED_STANDARD_KINDS.filter((kind) => !present.has(kind));
  return {
    requiredComplete: missingRequired.length === 0,
    missingRequired,
    presentRequired: REQUIRED_STANDARD_KINDS.filter((kind) => present.has(kind)),
  };
}

export async function assertRequiredOrgStandardsPresent(organizationId: string): Promise<void> {
  const readiness = await getOrgStandardsReadiness(organizationId);
  if (!readiness.requiredComplete) {
    throw new MissingRequiredStandardsError(readiness.missingRequired);
  }
}

export async function getEffectiveStandards(
  organizationId: string,
  projectId: string,
): Promise<Standard[]> {
  const rows = await db.query.standards.findMany({
    where: and(
      eq(standards.organizationId, organizationId),
      eq(standards.enabled, true),
      isNull(standards.deletedAt),
      or(isNull(standards.projectId), eq(standards.projectId, projectId)),
    ),
    orderBy: [asc(standards.kind), asc(standards.title)],
  });

  const requiredByKind = new Map<RequiredStandardKind, Standard>();
  const customBySlug = new Map<string, Standard>();
  const sorted = [...rows].sort((a, b) => {
    if (a.projectId && !b.projectId) return -1;
    if (!a.projectId && b.projectId) return 1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  for (const row of sorted) {
    if (isRequiredKind(row.kind)) {
      if (!requiredByKind.has(row.kind)) requiredByKind.set(row.kind, row);
      continue;
    }
    if (row.kind === "custom" && !customBySlug.has(row.slug)) {
      customBySlug.set(row.slug, row);
    }
  }

  const requiredRows = REQUIRED_STANDARD_KINDS
    .map((kind) => requiredByKind.get(kind))
    .filter((row): row is Standard => Boolean(row));
  const customRows = [...customBySlug.values()].sort((a, b) => a.title.localeCompare(b.title));
  return [...requiredRows, ...customRows];
}

export async function getStandardsManifest(
  organizationId: string,
  projectId: string,
): Promise<StandardsManifest> {
  const [readiness, effective] = await Promise.all([
    getOrgStandardsReadiness(organizationId),
    getEffectiveStandards(organizationId, projectId),
  ]);
  const entries = effective.map(toManifestEntry);
  return {
    standards: entries,
    missingRequired: readiness.missingRequired,
    requiredComplete: readiness.requiredComplete,
    manifestHash: canonicalManifestHash(entries),
  };
}

export async function getStandardsBundle(
  organizationId: string,
  projectId: string,
  slugs?: string[],
): Promise<StandardsBundle> {
  const manifest = await getStandardsManifest(organizationId, projectId);
  const allowed = slugs && slugs.length > 0 ? new Set(slugs) : null;
  const bySlug = new Map(manifest.standards.map((entry) => [entry.slug, entry]));
  if (allowed) {
    for (const slug of allowed) {
      if (!bySlug.has(slug)) throw new Error(`Unknown standard slug: ${slug}`);
    }
  }
  const effective = await getEffectiveStandards(organizationId, projectId);
  const bodyById = new Map(effective.map((row) => [row.id, row.body]));
  return {
    ...manifest,
    standards: manifest.standards
      .filter((entry) => !allowed || allowed.has(entry.slug))
      .map((entry) => ({
        ...entry,
        content: bodyById.get(entry.sourceStandardId) ?? "",
      })),
  };
}

export async function buildEffectiveStandardsPromptBlock(
  organizationId: string,
  projectId: string,
): Promise<string> {
  await assertRequiredOrgStandardsPresent(organizationId);
  const effective = await getEffectiveStandards(organizationId, projectId);
  const lines = [
    "# Effective Organization Standards",
    "",
    "The following standards are authoritative. Follow them exactly as written. Do not paraphrase, infer missing policy, or edit them.",
  ];
  for (const row of effective) {
    lines.push(
      "",
      `## ${row.title}`,
      "",
      `- kind: ${row.kind}`,
      `- scope: ${scopeOf(row)}`,
      `- version: ${row.version}`,
      `- sha256: ${row.contentHash}`,
      "",
      `----- BEGIN STANDARD BODY ${row.contentHash} -----`,
      row.body,
      `----- END STANDARD BODY ${row.contentHash} -----`,
    );
  }
  return lines.join("\n");
}

export async function upsertStandard(input: UpsertStandardInput): Promise<Standard> {
  const ctx = await getActionContext();
  assertElevatedRole(ctx, "Changing organization standards");

  const parsed = standardInputSchema.parse(input);
  const contentHash = hashStandardBody(parsed.body);
  const projectId = parsed.projectId ?? null;
  const existing = await db.query.standards.findFirst({
    where: and(
      eq(standards.organizationId, ctx.organizationId),
      eq(standards.enabled, true),
      isNull(standards.deletedAt),
      projectId ? eq(standards.projectId, projectId) : isNull(standards.projectId),
      parsed.kind === "custom"
        ? eq(standards.slug, parsed.slug)
        : eq(standards.kind, parsed.kind),
    ),
  });

  if (projectId) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)),
      columns: { id: true },
    });
    if (!project) throw new Error(`Project ${projectId} not found in this organization.`);
  }

  if (existing) {
    const [row] = await db
      .update(standards)
      .set({
        kind: parsed.kind,
        slug: parsed.slug,
        title: parsed.title,
        body: parsed.body,
        format: parsed.format,
        version: parsed.version,
        contentHash,
        sourceFileName: parsed.sourceFileName ?? null,
        enabled: parsed.enabled ?? true,
        ...ctx.auditUpdate(),
      })
      .where(and(eq(standards.id, existing.id), eq(standards.organizationId, ctx.organizationId)))
      .returning();
    await auditStandardMutation({
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      actorName: ctx.user.name,
      action: "standard.updated",
      standard: row,
      before: auditShape(existing),
      after: auditShape(row),
      summary: `Updated ${row.title}`,
      invokedVia: "standards:upsert",
    });
    safeRevalidate("/projects");
    safeRevalidate("/standards");
    return row;
  }

  const [row] = await db
    .insert(standards)
    .values({
      organizationId: ctx.organizationId,
      projectId,
      kind: parsed.kind,
      slug: parsed.slug,
      title: parsed.title,
      body: parsed.body,
      format: parsed.format,
      version: parsed.version,
      contentHash,
      sourceFileName: parsed.sourceFileName ?? null,
      enabled: parsed.enabled ?? true,
      createdById: ctx.userId,
      createdByName: ctx.user.name,
      updatedById: ctx.userId,
      updatedByName: ctx.user.name,
    })
    .returning();

  await auditStandardMutation({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    actorName: ctx.user.name,
    action: row.projectId ? "standard.project_override_created" : "standard.created",
    standard: row,
    after: auditShape(row),
    summary: `${row.projectId ? "Created project override" : "Created org standard"}: ${row.title}`,
    invokedVia: "standards:upsert",
  });
  safeRevalidate("/projects");
  safeRevalidate("/standards");
  return row;
}

export async function softDeleteStandard(id: string): Promise<void> {
  const ctx = await getActionContext();
  assertElevatedRole(ctx, "Deleting organization standards");
  const existing = await db.query.standards.findFirst({
    where: and(eq(standards.id, id), eq(standards.organizationId, ctx.organizationId)),
  });
  if (!existing) throw new Error(`Standard ${id} not found.`);

  await db
    .update(standards)
    .set({
      enabled: false,
      deletedAt: new Date(),
      ...ctx.auditUpdate(),
    })
    .where(and(eq(standards.id, id), eq(standards.organizationId, ctx.organizationId)));

  await auditStandardMutation({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    actorName: ctx.user.name,
    action: "standard.deleted",
    standard: existing,
    before: auditShape(existing),
    summary: `Deleted ${existing.title}`,
    invokedVia: "standards:delete",
  });
  safeRevalidate("/projects");
  safeRevalidate("/standards");
}

export async function auditProjectStandardsInheritance(input: {
  organizationId: string;
  projectId: string;
  actorId: string | null;
  actorName: string | null;
}) {
  const effective = await getEffectiveStandards(input.organizationId, input.projectId);
  const inherited = effective.filter((row) => row.projectId === null);
  if (inherited.length === 0) return;
  await db.insert(auditLogs).values(
    inherited.map((row) => ({
      organizationId: input.organizationId,
      actorType: "user" as const,
      actorId: input.actorId,
      actorName: input.actorName,
      action: "standard.inherited_by_project",
      entityType: "standard",
      entityId: row.id,
      summary: `Project inherited ${row.title}`,
      after: {
        ...auditShape(row),
        projectId: input.projectId,
      },
      invokedVia: "project:create",
    })),
  );
}
