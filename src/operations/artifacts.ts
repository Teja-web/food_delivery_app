import { createHash } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema/audit/audit-log";
import {
  ARTIFACT_FILE_TYPES,
  ORGANIZATION_ARTIFACT_LABELS,
  REQUIRED_ORGANIZATION_ARTIFACT_FILE_NAMES,
  ORGANIZATION_ARTIFACT_UPLOAD_FIELDS,
  PROJECT_ARTIFACT_KINDS,
  PROJECT_ARTIFACT_CREATED_VIA,
  REQUIRED_ORGANIZATION_ARTIFACT_KEYS,
  organizationArtifacts,
  projectArtifacts,
  type ArtifactFileType,
  type ArtifactMetadata,
  type OrganizationArtifact,
  type ProjectArtifact,
  type ProjectArtifactCreatedVia,
  type ProjectArtifactKind,
  type RequiredOrganizationArtifactKey,
} from "@/db/schema/artifact";
import { projects } from "@/db/schema/project";
import { assertElevatedRole, getActionContext, hasElevatedRole, type ScopedActionContext } from "@/lib/auth/context";
import { safeRevalidate } from "@/lib/safe-revalidate";

export {
  ORGANIZATION_ARTIFACT_LABELS,
  REQUIRED_ORGANIZATION_ARTIFACT_FILE_NAMES,
  ORGANIZATION_ARTIFACT_UPLOAD_FIELDS,
  REQUIRED_ORGANIZATION_ARTIFACT_KEYS,
} from "@/db/schema/artifact";

export type ArtifactScope = "org" | "project";
export type ArtifactFormat = "markdown" | "text" | "html" | "json";
type LifecycleArtifactKey = "requirements" | "design" | "development";
const REQUIREMENTS_EXISTS_MESSAGE = "requirements.md already exists.\nNo changes were made.";
const DESIGN_EXISTS_MESSAGE = "design.md already exists.\n\nNo changes were made.";
const REQUIREMENTS_MISSING_FOR_DESIGN_MESSAGE =
  "Cannot create design.md because requirements.md does not exist.\n\nPlease create requirements.md first.";

export interface ArtifactManifestEntry {
  id: string;
  kind: RequiredOrganizationArtifactKey | ProjectArtifactKind | "custom";
  title: string;
  name: string;
  type: ArtifactFileType;
  format: ArtifactFormat;
  category: string | null;
  requiredKey: RequiredOrganizationArtifactKey | null;
  projectArtifactKind: ProjectArtifactKind | null;
  version: string;
  hash: string;
  scope: ArtifactScope;
  sourceArtifactId: string;
  sourceFileName: string | null;
  updatedAt: string;
  resourceUri: string;
  /** Back-compat alias for older sync clients. Prefer `name`/`sourceFileName`. */
  fileName: string;
  /** Back-compat alias for older sync clients that wrote `.coznt/standards/<slug>.md`. */
  slug: string;
}

export interface ArtifactBundleEntry extends ArtifactManifestEntry {
  content: string;
}

export interface ArtifactsManifest {
  standards: ArtifactManifestEntry[];
  artifacts: ArtifactManifestEntry[];
  missingRequired: RequiredOrganizationArtifactKey[];
  requiredComplete: boolean;
  manifestHash: string;
}

export interface ArtifactsBundle extends Omit<ArtifactsManifest, "standards" | "artifacts"> {
  standards: ArtifactBundleEntry[];
  artifacts: ArtifactBundleEntry[];
}

export class MissingRequiredOrganizationArtifactsError extends Error {
  status = 409;
  constructor(public readonly missing: RequiredOrganizationArtifactKey[]) {
    super(
      `Required organization artifacts are missing: ${missing
        .map((key) => ORGANIZATION_ARTIFACT_LABELS[key])
        .join(", ")}.`,
    );
    this.name = "MissingRequiredOrganizationArtifactsError";
  }
}

export class ProjectArtifactDependencyError extends Error {
  status = 409;
  constructor(message: string) {
    super(message);
    this.name = "ProjectArtifactDependencyError";
  }
}

const artifactInputSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().optional(),
  name: z.string().min(1),
  body: z.string().min(1),
  summary: z.string().optional().nullable(),
  type: z.enum(ARTIFACT_FILE_TYPES),
  category: z.string().optional().nullable(),
  title: z.string().min(1),
  requiredKey: z.enum(REQUIRED_ORGANIZATION_ARTIFACT_KEYS).optional().nullable(),
  projectArtifactKind: z.enum(PROJECT_ARTIFACT_KINDS).optional().nullable(),
  createdVia: z.enum(PROJECT_ARTIFACT_CREATED_VIA).optional().default("upload"),
});

export type UpsertOrganizationArtifactInput = z.input<typeof artifactInputSchema>;
export type UpsertProjectArtifactInput = z.input<typeof artifactInputSchema> & {
  projectId: string;
};

function canonicalManifestHash(entries: { name: string; hash: string; scope: ArtifactScope }[]): string {
  const canonical = [...entries]
    .sort((a, b) => `${a.scope}:${a.name}`.localeCompare(`${b.scope}:${b.name}`))
    .map((entry) => `${entry.scope}:${entry.name}:${entry.hash}`)
    .join("\n");
  return hashArtifactBody(canonical);
}

function metadataRequiredKeyPredicate(
  table: typeof organizationArtifacts | typeof projectArtifacts,
  key: RequiredOrganizationArtifactKey,
) {
  return sql`${table.metadata}->>'requiredKey' = ${key}`;
}

function artifactTitle(row: Pick<OrganizationArtifact | ProjectArtifact, "metadata" | "name">): string {
  return typeof row.metadata.title === "string" && row.metadata.title.trim()
    ? row.metadata.title
    : row.name;
}

function artifactHash(row: Pick<OrganizationArtifact | ProjectArtifact, "metadata" | "body">): string {
  return typeof row.metadata.contentHash === "string"
    ? row.metadata.contentHash
    : hashArtifactBody(row.body);
}

function artifactFormat(type: ArtifactFileType): ArtifactFormat {
  if (type === ".txt") return "text";
  if (type === ".html") return "html";
  if (type === ".json") return "json";
  return "markdown";
}

function artifactSlug(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artifact";
}

function isProjectArtifactKind(value: unknown): value is ProjectArtifactKind {
  return (PROJECT_ARTIFACT_KINDS as readonly unknown[]).includes(value);
}

function projectArtifactKind(
  row: Pick<ProjectArtifact, "metadata" | "name" | "category">,
): ProjectArtifactKind | null {
  if (isProjectArtifactKind(row.metadata.projectArtifactKind)) {
    return row.metadata.projectArtifactKind;
  }

  const title =
    typeof row.metadata.title === "string" ? row.metadata.title.toLowerCase() : "";
  const name = row.name.toLowerCase();
  if (row.category === "project-exclusive") {
    if (title.includes("requirement") || name.includes("requirement")) return "requirements";
    if (title.includes("design") || name.includes("design")) return "design";
  }
  return null;
}

function isRequiredProjectArtifactKind(
  kind: ProjectArtifactKind | null | undefined,
): kind is "requirements" | "design" {
  return kind === "requirements" || kind === "design";
}

function normalizeLifecycleArtifactName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (normalized.endsWith(".md")) return normalized.slice(0, -3);
  if (normalized.endsWith(".txt")) return normalized.slice(0, -4);
  return normalized;
}

function resolveLifecycleArtifactKey(input: {
  name: string;
  type: ArtifactFileType;
}): LifecycleArtifactKey | null {
  if (input.type !== ".md") return null;
  const normalized = normalizeLifecycleArtifactName(input.name);
  if (normalized === "requirements" || normalized === "design" || normalized === "development") {
    return normalized;
  }
  return null;
}

export function resolveProjectLifecycleArtifactValidation(input: {
  target: LifecycleArtifactKey | null;
  isCreate: boolean;
  hasRequirements: boolean;
  hasDesign: boolean;
}): string | null {
  if (!input.target || !input.isCreate) return null;

  if (input.target === "requirements" && input.hasRequirements) {
    return REQUIREMENTS_EXISTS_MESSAGE;
  }
  if (input.target === "design") {
    if (!input.hasRequirements) {
      return REQUIREMENTS_MISSING_FOR_DESIGN_MESSAGE;
    }
    if (input.hasDesign) {
      return DESIGN_EXISTS_MESSAGE;
    }
  }
  if (input.target === "development") {
    const missing: string[] = [];
    if (!input.hasRequirements) missing.push("Requirements");
    if (!input.hasDesign) missing.push("Design");
    if (missing.length > 0) {
      return `Development artifact requires prerequisite artifact(s): ${missing.join(", ")}.`;
    }
  }
  return null;
}

export async function hasExistingRequirementsMarkdownArtifact(
  organizationId: string,
  projectId: string,
): Promise<boolean> {
  const requirementsArtifact = await db.query.projectArtifacts.findFirst({
    where: and(
      eq(projectArtifacts.organizationId, organizationId),
      eq(projectArtifacts.projectId, projectId),
      eq(projectArtifacts.name, "requirements.md"),
      eq(projectArtifacts.type, ".md"),
    ),
    columns: { id: true },
  });
  return Boolean(requirementsArtifact);
}

export async function hasExistingDesignMarkdownArtifact(
  organizationId: string,
  projectId: string,
): Promise<boolean> {
  const designArtifact = await db.query.projectArtifacts.findFirst({
    where: and(
      eq(projectArtifacts.organizationId, organizationId),
      eq(projectArtifacts.projectId, projectId),
      eq(projectArtifacts.name, "design.md"),
      eq(projectArtifacts.type, ".md"),
    ),
    columns: { id: true },
  });
  return Boolean(designArtifact);
}

function toMetadata(input: {
  title: string;
  requiredKey?: RequiredOrganizationArtifactKey | null;
  projectArtifactKind?: ProjectArtifactKind | null;
  body: string;
  extra?: ArtifactMetadata;
}): ArtifactMetadata {
  return {
    ...(input.extra ?? {}),
    title: input.title,
    contentHash: hashArtifactBody(input.body),
    ...(input.requiredKey ? { requiredKey: input.requiredKey } : {}),
    ...(input.projectArtifactKind ? { projectArtifactKind: input.projectArtifactKind } : {}),
  };
}

function toManifestEntry(row: ProjectArtifact): ArtifactManifestEntry {
  const hash = artifactHash(row);
  return {
    id: row.id,
    kind: row.metadata.requiredKey ?? row.metadata.projectArtifactKind ?? "custom",
    title: artifactTitle(row),
    name: row.name,
    type: row.type,
    format: artifactFormat(row.type),
    category: row.category,
    requiredKey: row.metadata.requiredKey ?? null,
    projectArtifactKind: row.metadata.projectArtifactKind ?? null,
    version: "1.0.0",
    hash,
    scope: "project",
    sourceArtifactId: row.id,
    sourceFileName: row.name,
    updatedAt: row.updatedAt.toISOString(),
    resourceUri: "coznt://standards",
    fileName: row.name,
    slug: artifactSlug(row.name),
  };
}

function auditShape(row: OrganizationArtifact | ProjectArtifact, scope: ArtifactScope) {
  const projectId = "projectId" in row ? row.projectId : null;
  return {
    id: row.id,
    projectId,
    name: row.name,
    title: artifactTitle(row),
    type: row.type,
    category: row.category,
    scope,
    contentHash: artifactHash(row),
    metadata: row.metadata,
  };
}

function assertProjectArtifactWriteAllowed(
  ctx: ScopedActionContext,
  projectId: string,
  action: string,
): void {
  if (hasElevatedRole(ctx) || ctx.projectId === projectId) return;
  assertElevatedRole(ctx, action);
}

async function auditArtifactMutation(input: {
  organizationId: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityId: string;
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
    entityType: "artifact",
    entityId: input.entityId,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
    invokedVia: input.invokedVia,
  });
}

export function hashArtifactBody(body: string): string {
  return createHash("sha256").update(body, "utf-8").digest("hex");
}

export async function listOrganizationArtifacts(): Promise<OrganizationArtifact[]> {
  const ctx = await getActionContext();
  return db.query.organizationArtifacts.findMany({
    where: eq(organizationArtifacts.organizationId, ctx.organizationId),
    orderBy: [asc(organizationArtifacts.name)],
  });
}

export async function listProjectArtifacts(projectId: string): Promise<ProjectArtifact[]> {
  const ctx = await getActionContext();
  return db.query.projectArtifacts.findMany({
    where: and(
      eq(projectArtifacts.organizationId, ctx.organizationId),
      eq(projectArtifacts.projectId, projectId),
    ),
    orderBy: [asc(projectArtifacts.name)],
  });
}

export interface ProjectRequiredArtifactRows {
  requirements: ProjectArtifact | null;
  design: ProjectArtifact | null;
}

export async function getProjectRequiredArtifactRows(
  organizationId: string,
  projectId: string,
): Promise<ProjectRequiredArtifactRows> {
  const rows = await db.query.projectArtifacts.findMany({
    where: and(
      eq(projectArtifacts.organizationId, organizationId),
      eq(projectArtifacts.projectId, projectId),
    ),
    orderBy: [asc(projectArtifacts.createdAt), asc(projectArtifacts.name)],
  });

  const required: ProjectRequiredArtifactRows = {
    requirements: null,
    design: null,
  };

  for (const row of rows) {
    const kind = projectArtifactKind(row);
    if ((kind === "requirements" || kind === "design") && !required[kind]) {
      required[kind] = row;
    }
  }

  return required;
}

export async function getProjectArtifactsReadiness(
  organizationId: string,
  projectId: string,
): Promise<{
  requiredComplete: boolean;
  missingRequired: Array<"requirements" | "design">;
  presentRequired: Array<"requirements" | "design">;
}> {
  const requiredRows = await getProjectRequiredArtifactRows(organizationId, projectId);
  const required = ["requirements", "design"] as const;
  const missingRequired = required.filter((kind) => !requiredRows[kind]);
  return {
    requiredComplete: missingRequired.length === 0,
    missingRequired,
    presentRequired: required.filter((kind) => Boolean(requiredRows[kind])),
  };
}

export async function getOrganizationArtifactsReadiness(organizationId?: string): Promise<{
  requiredComplete: boolean;
  missingRequired: RequiredOrganizationArtifactKey[];
  presentRequired: RequiredOrganizationArtifactKey[];
}> {
  const orgId = organizationId ?? (await getActionContext()).organizationId;
  const rows = await db.query.organizationArtifacts.findMany({
    where: eq(organizationArtifacts.organizationId, orgId),
    columns: { metadata: true },
  });
  const present = new Set(
    rows
      .map((row) => row.metadata.requiredKey)
      .filter((key): key is RequiredOrganizationArtifactKey =>
        (REQUIRED_ORGANIZATION_ARTIFACT_KEYS as readonly string[]).includes(key ?? ""),
      ),
  );
  const missingRequired = REQUIRED_ORGANIZATION_ARTIFACT_KEYS.filter((key) => !present.has(key));
  return {
    requiredComplete: missingRequired.length === 0,
    missingRequired,
    presentRequired: REQUIRED_ORGANIZATION_ARTIFACT_KEYS.filter((key) => present.has(key)),
  };
}

export async function assertRequiredOrganizationArtifactsPresent(organizationId: string): Promise<void> {
  const readiness = await getOrganizationArtifactsReadiness(organizationId);
  if (!readiness.requiredComplete) {
    throw new MissingRequiredOrganizationArtifactsError(readiness.missingRequired);
  }
}

export async function getProjectArtifactsManifest(
  organizationId: string,
  projectId: string,
): Promise<ArtifactsManifest> {
  const [readiness, rows] = await Promise.all([
    getOrganizationArtifactsReadiness(organizationId),
    db.query.projectArtifacts.findMany({
      where: and(
        eq(projectArtifacts.organizationId, organizationId),
        eq(projectArtifacts.projectId, projectId),
      ),
      orderBy: [asc(projectArtifacts.name)],
    }),
  ]);
  const entries = rows.map(toManifestEntry);
  return {
    standards: entries,
    artifacts: entries,
    missingRequired: readiness.missingRequired,
    requiredComplete: readiness.requiredComplete,
    manifestHash: canonicalManifestHash(entries),
  };
}

export async function getProjectArtifactsBundle(
  organizationId: string,
  projectId: string,
  names?: string[],
): Promise<ArtifactsBundle> {
  const manifest = await getProjectArtifactsManifest(organizationId, projectId);
  const allowed = names && names.length > 0 ? new Set(names) : null;
  const aliases = new Map<string, ArtifactManifestEntry>();
  for (const entry of manifest.artifacts) {
    aliases.set(entry.name, entry);
    aliases.set(entry.sourceFileName ?? entry.name, entry);
    aliases.set(entry.fileName, entry);
    aliases.set(entry.slug, entry);
  }
  if (allowed) {
    for (const name of allowed) {
      if (!aliases.has(name)) throw new Error(`Unknown artifact name: ${name}`);
    }
  }

  const rows = await db.query.projectArtifacts.findMany({
    where: and(
      eq(projectArtifacts.organizationId, organizationId),
      eq(projectArtifacts.projectId, projectId),
    ),
  });
  const bodyById = new Map(rows.map((row) => [row.id, row.body]));
  const entries = manifest.artifacts
    .filter(
      (entry) =>
        !allowed ||
        allowed.has(entry.name) ||
        allowed.has(entry.sourceFileName ?? entry.name) ||
        allowed.has(entry.fileName) ||
        allowed.has(entry.slug),
    )
    .map((entry) => ({
      ...entry,
      content: bodyById.get(entry.sourceArtifactId) ?? "",
    }));
  return {
    ...manifest,
    standards: entries,
    artifacts: entries,
  };
}

export async function buildProjectArtifactsPromptBlock(
  organizationId: string,
  projectId: string,
): Promise<string> {
  await assertRequiredOrganizationArtifactsPresent(organizationId);
  const rows = await db.query.projectArtifacts.findMany({
    where: and(
      eq(projectArtifacts.organizationId, organizationId),
      eq(projectArtifacts.projectId, projectId),
    ),
    orderBy: [asc(projectArtifacts.name)],
  });
  if (rows.length === 0) return "";
  const lines = [
    "# Effective Project Artifacts",
    "",
    "The following organization/project artifacts are authoritative. Follow them exactly as written. Do not paraphrase, infer missing policy, or edit them.",
  ];
  for (const row of rows) {
    const hash = artifactHash(row);
    lines.push(
      "",
      `## ${artifactTitle(row)}`,
      "",
      `- file: ${row.name}`,
      `- type: ${row.type}`,
      `- scope: project`,
      `- sha256: ${hash}`,
      "",
      `----- BEGIN ARTIFACT BODY ${hash} -----`,
      row.body,
      `----- END ARTIFACT BODY ${hash} -----`,
    );
  }
  return lines.join("\n");
}

export async function upsertOrganizationArtifact(
  input: UpsertOrganizationArtifactInput,
): Promise<OrganizationArtifact> {
  const ctx = await getActionContext();
  assertElevatedRole(ctx, "Changing organization artifacts");

  const parsed = artifactInputSchema.parse(input);
  const metadata = toMetadata({
    title: parsed.title,
    requiredKey: parsed.requiredKey,
    body: parsed.body,
  });
  const existing = parsed.id
    ? await db.query.organizationArtifacts.findFirst({
        where: and(
          eq(organizationArtifacts.organizationId, ctx.organizationId),
          eq(organizationArtifacts.id, parsed.id),
        ),
      })
    : await db.query.organizationArtifacts.findFirst({
        where: and(
          eq(organizationArtifacts.organizationId, ctx.organizationId),
          parsed.requiredKey
            ? metadataRequiredKeyPredicate(organizationArtifacts, parsed.requiredKey)
            : eq(organizationArtifacts.name, parsed.name),
        ),
      });

  if (existing) {
    const [row] = await db
      .update(organizationArtifacts)
      .set({
        name: parsed.name,
        body: parsed.body,
        summary: parsed.summary ?? null,
        type: parsed.type,
        category: parsed.category ?? null,
        metadata,
        creatorId: ctx.userId,
        creatorName: ctx.user.name,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizationArtifacts.id, existing.id),
          eq(organizationArtifacts.organizationId, ctx.organizationId),
        ),
      )
      .returning();
    await auditArtifactMutation({
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      actorName: ctx.user.name,
      action: "artifact.organization.updated",
      entityId: row.id,
      before: auditShape(existing, "org"),
      after: auditShape(row, "org"),
      summary: `Updated organization artifact ${artifactTitle(row)}`,
      invokedVia: "artifacts:upsert-organization",
    });
    safeRevalidate("/projects");
    safeRevalidate("/settings/standards");
    return row;
  }

  const [row] = await db
    .insert(organizationArtifacts)
    .values({
      organizationId: ctx.organizationId,
      name: parsed.name,
      body: parsed.body,
      summary: parsed.summary ?? null,
      type: parsed.type,
      category: parsed.category ?? null,
      metadata,
      creatorId: ctx.userId,
      creatorName: ctx.user.name,
    })
    .returning();
  await auditArtifactMutation({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    actorName: ctx.user.name,
    action: "artifact.organization.created",
    entityId: row.id,
    after: auditShape(row, "org"),
    summary: `Created organization artifact ${artifactTitle(row)}`,
    invokedVia: "artifacts:upsert-organization",
  });
  safeRevalidate("/projects");
  safeRevalidate("/settings/standards");
  return row;
}

export async function upsertProjectArtifact(input: UpsertProjectArtifactInput): Promise<ProjectArtifact> {
  const ctx = await getActionContext();

  const parsed = artifactInputSchema.extend({ projectId: z.string().min(1) }).parse(input);
  assertProjectArtifactWriteAllowed(ctx, parsed.projectId, "Changing project artifacts");
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, parsed.projectId), eq(projects.organizationId, ctx.organizationId)),
    columns: { id: true },
  });
  if (!project) throw new Error(`Project ${parsed.projectId} not found in this organization.`);

  const targetLifecycleArtifact = resolveLifecycleArtifactKey({
    name: parsed.name,
    type: parsed.type,
  });
  if (targetLifecycleArtifact) {
    if (targetLifecycleArtifact === "requirements" && !parsed.id) {
      const alreadyExists = await hasExistingRequirementsMarkdownArtifact(
        ctx.organizationId,
        parsed.projectId,
      );
      if (alreadyExists) {
        throw new ProjectArtifactDependencyError(
          REQUIREMENTS_EXISTS_MESSAGE,
        );
      }
    }
    const lifecycleArtifacts = await db.query.projectArtifacts.findMany({
      where: and(
        eq(projectArtifacts.organizationId, ctx.organizationId),
        eq(projectArtifacts.projectId, parsed.projectId),
        eq(projectArtifacts.type, ".md"),
      ),
      columns: {
        id: true,
        name: true,
      },
    });
    const byLifecycleName = new Set(
      lifecycleArtifacts
        .filter((row) => row.id !== parsed.id)
        .map((row) => normalizeLifecycleArtifactName(row.name)),
    );
    const validationError = resolveProjectLifecycleArtifactValidation({
      target: targetLifecycleArtifact,
      isCreate: !parsed.id,
      hasRequirements: byLifecycleName.has("requirements"),
      hasDesign: byLifecycleName.has("design"),
    });
    if (validationError) throw new ProjectArtifactDependencyError(validationError);
  }

  const metadata = toMetadata({
    title: parsed.title,
    requiredKey: parsed.requiredKey,
    projectArtifactKind: parsed.projectArtifactKind,
    body: parsed.body,
  });
  const existing = await findExistingProjectArtifactForUpsert({
    organizationId: ctx.organizationId,
    projectId: parsed.projectId,
    id: parsed.id,
    name: parsed.name,
    projectArtifactKind: parsed.projectArtifactKind,
  });

  if (existing) {
    const [row] = await db
      .update(projectArtifacts)
      .set({
        name: parsed.name,
        body: parsed.body,
        summary: parsed.summary ?? null,
        type: parsed.type,
        category: parsed.category ?? null,
        createdVia: parsed.createdVia,
        metadata,
        creatorId: ctx.userId,
        creatorName: ctx.user.name,
        updatedAt: new Date(),
      })
      .where(and(eq(projectArtifacts.id, existing.id), eq(projectArtifacts.organizationId, ctx.organizationId)))
      .returning();
    await auditArtifactMutation({
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      actorName: ctx.user.name,
      action: "artifact.project.updated",
      entityId: row.id,
      before: auditShape(existing, "project"),
      after: auditShape(row, "project"),
      summary: `Updated project artifact ${artifactTitle(row)}`,
      invokedVia: "artifacts:upsert-project",
    });
    return row;
  }

  const [row] = await db
    .insert(projectArtifacts)
    .values({
      organizationId: ctx.organizationId,
      projectId: parsed.projectId,
      name: parsed.name,
      body: parsed.body,
      summary: parsed.summary ?? null,
      type: parsed.type,
      category: parsed.category ?? null,
      createdVia: parsed.createdVia,
      metadata,
      creatorId: ctx.userId,
      creatorName: ctx.user.name,
    })
    .returning();
  await auditArtifactMutation({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    actorName: ctx.user.name,
    action: "artifact.project.created",
    entityId: row.id,
    after: auditShape(row, "project"),
    summary: `Created project artifact ${artifactTitle(row)}`,
    invokedVia: "artifacts:upsert-project",
  });
  return row;
}

async function findExistingProjectArtifactForUpsert(input: {
  organizationId: string;
  projectId: string;
  id?: string;
  name: string;
  projectArtifactKind?: ProjectArtifactKind | null;
}): Promise<ProjectArtifact | undefined> {
  if (input.id) {
    return db.query.projectArtifacts.findFirst({
      where: and(
        eq(projectArtifacts.organizationId, input.organizationId),
        eq(projectArtifacts.projectId, input.projectId),
        eq(projectArtifacts.id, input.id),
      ),
    });
  }

  if (isRequiredProjectArtifactKind(input.projectArtifactKind)) {
    const existingRequiredRows = await db.query.projectArtifacts.findMany({
      where: and(
        eq(projectArtifacts.organizationId, input.organizationId),
        eq(projectArtifacts.projectId, input.projectId),
      ),
      orderBy: [asc(projectArtifacts.updatedAt)],
    });
    const existingRequired = existingRequiredRows.find(
      (row) => projectArtifactKind(row) === input.projectArtifactKind,
    );
    if (existingRequired) return existingRequired;
  }

  return db.query.projectArtifacts.findFirst({
    where: and(
      eq(projectArtifacts.organizationId, input.organizationId),
      eq(projectArtifacts.projectId, input.projectId),
      eq(projectArtifacts.name, input.name),
    ),
  });
}

export async function cloneOrganizationArtifactsToProject(
  projectId: string,
  artifactIds: string[],
  createdVia: ProjectArtifactCreatedVia = "upload",
): Promise<ProjectArtifact[]> {
  const ctx = await getActionContext();
  if (artifactIds.length === 0) return [];

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)),
    columns: { id: true },
  });
  if (!project) throw new Error(`Project ${projectId} not found in this organization.`);

  const orgRows = await db.query.organizationArtifacts.findMany({
    where: and(
      eq(organizationArtifacts.organizationId, ctx.organizationId),
      inArray(organizationArtifacts.id, artifactIds),
    ),
  });
  if (orgRows.length !== new Set(artifactIds).size) {
    throw new Error("One or more organization artifacts were not found.");
  }

  const existingProjectRows = await db.query.projectArtifacts.findMany({
    where: and(
      eq(projectArtifacts.organizationId, ctx.organizationId),
      eq(projectArtifacts.projectId, projectId),
    ),
    columns: { metadata: true },
  });
  const existingSourceIds = new Set(
    existingProjectRows
      .map((row) => row.metadata.sourceOrganizationArtifactId)
      .filter((id): id is string => typeof id === "string"),
  );
  const rowsToClone = orgRows.filter((row) => !existingSourceIds.has(row.id));
  if (rowsToClone.length === 0) return [];

  const inserted = await db
    .insert(projectArtifacts)
    .values(
      rowsToClone.map((row) => ({
        organizationId: ctx.organizationId,
        projectId,
        name: row.name,
        body: row.body,
        summary: row.summary,
        type: row.type,
        category: row.category,
        createdVia,
        metadata: {
          ...row.metadata,
          sourceOrganizationArtifactId: row.id,
          contentHash: artifactHash(row),
        },
        creatorId: ctx.userId,
        creatorName: ctx.user.name,
      })),
    )
    .returning();

  if (inserted.length > 0) {
    await db.insert(auditLogs).values(
      inserted.map((row) => ({
        organizationId: ctx.organizationId,
        actorType: "user" as const,
        actorId: ctx.userId,
        actorName: ctx.user.name,
        action: "artifact.project.cloned",
        entityType: "artifact",
        entityId: row.id,
        summary: `Cloned project artifact ${artifactTitle(row)}`,
        before: null,
        after: auditShape(row, "project"),
        invokedVia: "project:create",
      })),
    );
  }

  return inserted;
}

export async function deleteOrganizationArtifact(id: string): Promise<void> {
  const ctx = await getActionContext();
  assertElevatedRole(ctx, "Deleting organization artifacts");
  const existing = await db.query.organizationArtifacts.findFirst({
    where: and(eq(organizationArtifacts.id, id), eq(organizationArtifacts.organizationId, ctx.organizationId)),
  });
  if (!existing) throw new Error(`Organization artifact ${id} not found.`);
  await db
    .delete(organizationArtifacts)
    .where(and(eq(organizationArtifacts.id, id), eq(organizationArtifacts.organizationId, ctx.organizationId)));
  await auditArtifactMutation({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    actorName: ctx.user.name,
    action: "artifact.organization.deleted",
    entityId: existing.id,
    before: auditShape(existing, "org"),
    summary: `Deleted organization artifact ${artifactTitle(existing)}`,
    invokedVia: "artifacts:delete-organization",
  });
  safeRevalidate("/projects");
  safeRevalidate("/settings/standards");
}

export async function deleteProjectArtifact(id: string): Promise<void> {
  const ctx = await getActionContext();
  const existing = await db.query.projectArtifacts.findFirst({
    where: and(eq(projectArtifacts.id, id), eq(projectArtifacts.organizationId, ctx.organizationId)),
  });
  if (!existing) throw new Error(`Project artifact ${id} not found.`);
  assertProjectArtifactWriteAllowed(ctx, existing.projectId, "Deleting project artifacts");
  await db
    .delete(projectArtifacts)
    .where(and(eq(projectArtifacts.id, id), eq(projectArtifacts.organizationId, ctx.organizationId)));
  await auditArtifactMutation({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    actorName: ctx.user.name,
    action: "artifact.project.deleted",
    entityId: existing.id,
    before: auditShape(existing, "project"),
    summary: `Deleted project artifact ${artifactTitle(existing)}`,
    invokedVia: "artifacts:delete-project",
  });
}
