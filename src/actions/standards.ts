"use server";

import { z } from "zod/v4";

import {
  REQUIRED_STANDARD_KINDS,
  STANDARD_KIND_LABELS,
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
  codingStandardsBody: z.string().refine((value) => value.trim().length > 0, "Coding Standards is required."),
  codingStandardsFormat: z.enum(STANDARD_FORMATS).optional().default("markdown"),
  codingStandardsSourceFileName: z.string().optional().nullable(),
  brandGuidelinesBody: z.string().refine((value) => value.trim().length > 0, "Brand Guidelines is required."),
  brandGuidelinesFormat: z.enum(STANDARD_FORMATS).optional().default("markdown"),
  brandGuidelinesSourceFileName: z.string().optional().nullable(),
  architecturePrinciplesBody: z.string().refine((value) => value.trim().length > 0, "Architecture Principles is required."),
  architecturePrinciplesFormat: z.enum(STANDARD_FORMATS).optional().default("markdown"),
  architecturePrinciplesSourceFileName: z.string().optional().nullable(),
  customStandards: z.array(customStandardSchema).optional().default([]),
});

export type SaveOrgStandardsSetupResult =
  | { ok: true; standards: SavedOrgStandard[] }
  | { ok: false; errors: string[] };

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

function slugForRequiredKind(kind: RequiredStandardKind): string {
  return kind.replaceAll("_", "-");
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
