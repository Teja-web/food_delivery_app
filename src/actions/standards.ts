"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";

import {
  REQUIRED_STANDARD_KINDS,
  STANDARD_KIND_LABELS,
  STANDARD_UPLOAD_FIELDS,
  upsertStandard,
} from "@/operations/standards";
import type { RequiredStandardKind } from "@/db/schema/standard";

const customStandardSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
  body: z.string().min(1),
});

export interface OrgStandardsOnboardingState {
  errors: string[];
}

const MAX_STANDARD_FILE_BYTES = 2 * 1024 * 1024;
const acceptedStandardExtensions = [".md", ".txt"] as const;

function slugForRequiredKind(kind: RequiredStandardKind): string {
  return kind.replaceAll("_", "-");
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
