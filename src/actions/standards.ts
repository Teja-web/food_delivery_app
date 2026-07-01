"use server";

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

const requiredPayloadSchema = z.object({
  codingStandardsBody: z.string().min(1, "Coding Standards is required."),
  brandGuidelinesBody: z.string().min(1, "Brand Guidelines is required."),
  architecturePrinciplesBody: z.string().min(1, "Architecture Principles is required."),
  customStandards: z.array(customStandardSchema).optional().default([]),
});

export type SaveOrgStandardsSetupResult =
  | { ok: true }
  | { ok: false; errors: string[] };

function slugForRequiredKind(kind: RequiredStandardKind): string {
  return kind.replaceAll("_", "-");
}

export async function saveOrgStandardsSetupAction(
  input: z.input<typeof requiredPayloadSchema>,
): Promise<SaveOrgStandardsSetupResult> {
  const parsed = requiredPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  try {
    for (const kind of REQUIRED_STANDARD_KINDS) {
      const field = STANDARD_UPLOAD_FIELDS[kind] as keyof z.infer<typeof requiredPayloadSchema>;
      const body = String(parsed.data[field] ?? "").trim();
      await upsertStandard({
        kind,
        slug: slugForRequiredKind(kind),
        title: STANDARD_KIND_LABELS[kind],
        body,
        format: "markdown",
        version: "1.0.0",
      });
    }
    for (const custom of parsed.data.customStandards) {
      await upsertStandard({
        kind: "custom",
        slug: custom.slug.trim(),
        title: custom.title.trim(),
        body: custom.body.trim(),
        format: "markdown",
        version: "1.0.0",
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : "Could not save standards."] };
  }
}
