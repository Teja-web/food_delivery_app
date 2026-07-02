"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";

import {
  REQUIRED_STANDARD_KINDS,
  STANDARD_KIND_LABELS,
  STANDARD_UPLOAD_FIELDS,
  softDeleteStandard,
  upsertStandard,
} from "@/operations/standards";
import {
  STANDARD_FORMATS,
  type RequiredStandardKind,
  type Standard,
  type StandardFormat,
} from "@/db/schema/standard";

const customStandardSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
  body: z.string().refine((value) => value.trim().length > 0, "Standard body is required."),
  format: z.enum(STANDARD_FORMATS).optional().default("markdown"),
  sourceFileName: z.string().optional().nullable(),
});

const requiredPayloadSchema = z.object({
  codingStandardsBody: z
    .string()
    .refine((value) => value.trim().length > 0, "Coding Standards is required."),
  codingStandardsFormat: z.enum(STANDARD_FORMATS).optional().default("markdown"),
  codingStandardsSourceFileName: z.string().optional().nullable(),
  brandGuidelinesBody: z
    .string()
    .refine((value) => value.trim().length > 0, "Brand Guidelines is required."),
  brandGuidelinesFormat: z.enum(STANDARD_FORMATS).optional().default("markdown"),
  brandGuidelinesSourceFileName: z.string().optional().nullable(),
  architecturePrinciplesBody: z
    .string()
    .refine((value) => value.trim().length > 0, "Architecture Principles is required."),
  architecturePrinciplesFormat: z.enum(STANDARD_FORMATS).optional().default("markdown"),
  architecturePrinciplesSourceFileName: z.string().optional().nullable(),
  customStandards: z.array(customStandardSchema).optional().default([]),
});

export interface OrgStandardsOnboardingState {
  errors: string[];
}

export interface SavedOrgStandard {
  id: string;
  kind: "coding_standards" | "brand_guidelines" | "architecture_principles" | "custom";
  slug: string;
  title: string;
  body: string;
  format: StandardFormat;
  version: string;
  hash: string;
  sourceFileName: string | null;
  updatedAt: string;
}

export type SaveOrgStandardsSetupResult =
  | { ok: true; standards: SavedOrgStandard[] }
  | { ok: false; errors: string[] };

const MAX_STANDARD_FILE_BYTES = 2 * 1024 * 1024;
const acceptedStandardExtensions = [".md", ".txt"] as const;

function slugForRequiredKind(kind: RequiredStandardKind): string {
  return kind.replaceAll("_", "-");
}

function serializeSavedStandard(row: Standard): SavedOrgStandard {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    body: row.body,
    format: row.format,
    version: row.version,
    hash: row.contentHash,
    sourceFileName: row.sourceFileName,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requiredInputForKind(
  data: z.infer<typeof requiredPayloadSchema>,
  kind: RequiredStandardKind,
): { body: string; format: StandardFormat; sourceFileName: string | null } {
  switch (kind) {
    case "coding_standards":
      return {
        body: data.codingStandardsBody,
        format: data.codingStandardsFormat,
        sourceFileName: data.codingStandardsSourceFileName ?? null,
      };
    case "brand_guidelines":
      return {
        body: data.brandGuidelinesBody,
        format: data.brandGuidelinesFormat,
        sourceFileName: data.brandGuidelinesSourceFileName ?? null,
      };
    case "architecture_principles":
      return {
        body: data.architecturePrinciplesBody,
        format: data.architecturePrinciplesFormat,
        sourceFileName: data.architecturePrinciplesSourceFileName ?? null,
      };
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extensionFor(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function isAcceptedStandardFile(file: File): boolean {
  return acceptedStandardExtensions.includes(
    extensionFor(file.name) as (typeof acceptedStandardExtensions)[number],
  );
}

function formString(value: FormDataEntryValue | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

async function readUploadedStandardFile(input: {
  formData: FormData;
  fieldName: string;
  label: string;
  required: boolean;
  errors: string[];
}): Promise<{ body: string; sourceFileName: string; format: "markdown" | "text" } | null> {
  const value = input.formData.get(input.fieldName);
  if (!(value instanceof File) || value.name.trim().length === 0) {
    if (input.required) input.errors.push(`${input.label} file is required.`);
    return null;
  }

  if (!isAcceptedStandardFile(value)) {
    input.errors.push(`${input.label} must be a .md or .txt file.`);
    return null;
  }

  if (value.size > MAX_STANDARD_FILE_BYTES) {
    input.errors.push(`${input.label} must be 2 MB or smaller.`);
    return null;
  }

  const body = await value.text();
  if (body.trim().length === 0) {
    input.errors.push(`${input.label} cannot be empty.`);
    return null;
  }

  return {
    body,
    sourceFileName: value.name,
    format: extensionFor(value.name) === ".txt" ? "text" : "markdown",
  };
}

export async function saveOrgStandardsSetupAction(
  input: z.input<typeof requiredPayloadSchema>,
): Promise<SaveOrgStandardsSetupResult> {
  const parsed = requiredPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  try {
    const saved: SavedOrgStandard[] = [];
    for (const kind of REQUIRED_STANDARD_KINDS) {
      const standard = requiredInputForKind(parsed.data, kind);
      const row = await upsertStandard({
        kind,
        slug: slugForRequiredKind(kind),
        title: STANDARD_KIND_LABELS[kind],
        body: standard.body,
        format: standard.format,
        version: "1.0.0",
        sourceFileName: standard.sourceFileName,
      });
      saved.push(serializeSavedStandard(row));
    }
    for (const custom of parsed.data.customStandards) {
      const row = await upsertStandard({
        kind: "custom",
        slug: custom.slug.trim(),
        title: custom.title.trim(),
        body: custom.body,
        format: custom.format,
        version: "1.0.0",
        sourceFileName: custom.sourceFileName ?? null,
      });
      saved.push(serializeSavedStandard(row));
    }
    return { ok: true, standards: saved };
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : "Could not save standards."] };
  }
}

export async function deleteOrgStandardAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await softDeleteStandard(id);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not delete standard.",
    };
  }
}

export async function completeOrgStandardsOnboardingAction(
  _prevState: OrgStandardsOnboardingState,
  formData: FormData,
): Promise<OrgStandardsOnboardingState> {
  const errors: string[] = [];
  const requiredUploads = await Promise.all(
    REQUIRED_STANDARD_KINDS.map(async (kind) => ({
      kind,
      upload: await readUploadedStandardFile({
        formData,
        fieldName: `${STANDARD_UPLOAD_FIELDS[kind]}File`,
        label: STANDARD_KIND_LABELS[kind],
        required: true,
        errors,
      }),
    })),
  );

  const customTitles = formData.getAll("customStandardTitle");
  const customSlugs = formData.getAll("customStandardSlug");
  const customFiles = formData.getAll("customStandardFile");
  const customStandards: Array<{
    title: string;
    slug: string;
    body: string;
    format: "markdown" | "text";
    sourceFileName: string;
  }> = [];
  const seenCustomSlugs = new Set<string>();

  for (let index = 0; index < customFiles.length; index += 1) {
    const file = customFiles[index];
    const rawTitle = formString(customTitles[index]);
    const rawSlug = formString(customSlugs[index]);
    const hasFile = file instanceof File && file.name.trim().length > 0;
    const hasText = rawTitle.length > 0 || rawSlug.length > 0;

    if (!hasFile && !hasText) continue;
    if (!(file instanceof File) || file.name.trim().length === 0) {
      errors.push(`Additional standard ${index + 1} needs a .md or .txt file.`);
      continue;
    }

    const title =
      rawTitle ||
      file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .trim();
    const slug = rawSlug || slugify(title);
    const parsed = customStandardSchema.safeParse({ title, slug, body: "placeholder" });
    if (!parsed.success) {
      errors.push(`Additional standard ${index + 1} needs a valid title and slug.`);
      continue;
    }
    if (seenCustomSlugs.has(slug)) {
      errors.push(`Additional standard slug "${slug}" is duplicated.`);
      continue;
    }

    const upload = await readUploadedStandardFile({
      formData: (() => {
        const single = new FormData();
        single.set("file", file);
        return single;
      })(),
      fieldName: "file",
      label: title,
      required: true,
      errors,
    });
    if (!upload) continue;

    seenCustomSlugs.add(slug);
    customStandards.push({
      title,
      slug,
      body: upload.body,
      format: upload.format,
      sourceFileName: upload.sourceFileName,
    });
  }

  if (errors.length > 0 || requiredUploads.some((entry) => !entry.upload)) {
    return { errors };
  }

  try {
    for (const entry of requiredUploads) {
      if (!entry.upload) continue;
      await upsertStandard({
        kind: entry.kind,
        slug: slugForRequiredKind(entry.kind),
        title: STANDARD_KIND_LABELS[entry.kind],
        body: entry.upload.body,
        format: entry.upload.format,
        version: "1.0.0",
        sourceFileName: entry.upload.sourceFileName,
      });
    }
    for (const custom of customStandards) {
      await upsertStandard({
        kind: "custom",
        slug: custom.slug,
        title: custom.title,
        body: custom.body,
        format: custom.format,
        version: "1.0.0",
        sourceFileName: custom.sourceFileName,
      });
    }
  } catch (err) {
    return { errors: [err instanceof Error ? err.message : "Could not complete onboarding."] };
  }

  revalidatePath("/", "layout");
  redirect("/projects");
}
