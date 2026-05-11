import { createEntityCrud } from "@/lib/crud";
import { db } from "@/db/client";
import { departments, orgIdentity, organization } from "@/db/schema";
import type { ExtractedIdentity, UploadedDocument } from "@/db/schema/organization";
import { eq } from "drizzle-orm";
import { getActionContext } from "@/lib/auth/context";
import { nanoid } from "nanoid";
import { departmentSchema } from "./schemas";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { orgPublicProfileSchema, type OrgPublicProfile } from "@/lib/anonymize/taxonomy";

// -- Departments -------------------------------------------------------

const departmentCrud = createEntityCrud({
  db,
  table: departments,
  queryKey: "departments",
  idField: "id",
  schema: departmentSchema,
  onMutate: () => safeRevalidate("/settings/departments"),
  searchFields: ["name", "description"],
  searchConfig: { tableName: "departments" },
});

export const getDepartments = departmentCrud.list;
export const getDepartment = departmentCrud.get;
export const createDepartment = departmentCrud.create;
export const updateDepartment = departmentCrud.update;
export const deleteDepartment = departmentCrud.delete;

// -- Org Identity ------------------------------------------------------

export async function getOrgIdentity() {
  const ctx = await getActionContext();
  const result = await (db as any).query.orgIdentity.findFirst({
    where: eq(orgIdentity.organizationId, ctx.organizationId),
  });
  return result ?? null;
}

export async function upsertOrgIdentity(data: {
  rawText?: string;
  uploadedDocuments?: unknown;
}) {
  const ctx = await getActionContext();

  const existing = await (db as any).query.orgIdentity.findFirst({
    where: eq(orgIdentity.organizationId, ctx.organizationId),
  });

  if (existing) {
    const [updated] = await db
      .update(orgIdentity)
      .set({
        rawText: data.rawText,
        uploadedDocuments: data.uploadedDocuments as any,
        updatedAt: new Date(),
      })
      .where(eq(orgIdentity.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(orgIdentity)
    .values({
      id: nanoid(),
      organizationId: ctx.organizationId,
      rawText: data.rawText,
      uploadedDocuments: data.uploadedDocuments as any,
    })
    .returning();
  return created;
}

/**
 * Add a single uploaded document to the org identity's uploadedDocuments array.
 */
export async function addUploadedDocument(doc: UploadedDocument) {
  const ctx = await getActionContext();

  const existing = await (db as any).query.orgIdentity.findFirst({
    where: eq(orgIdentity.organizationId, ctx.organizationId),
  });

  const currentDocs: UploadedDocument[] = existing?.uploadedDocuments ?? [];
  const updatedDocs = [...currentDocs, doc];

  if (existing) {
    await db
      .update(orgIdentity)
      .set({ uploadedDocuments: updatedDocs as any, updatedAt: new Date() })
      .where(eq(orgIdentity.id, existing.id));
  } else {
    await db.insert(orgIdentity).values({
      id: nanoid(),
      organizationId: ctx.organizationId,
      uploadedDocuments: updatedDocs as any,
    });
  }
}

/**
 * Remove an uploaded document by ID from the org identity.
 */
export async function removeUploadedDocument(docId: string) {
  const ctx = await getActionContext();

  const existing = await (db as any).query.orgIdentity.findFirst({
    where: eq(orgIdentity.organizationId, ctx.organizationId),
  });

  if (!existing) return;

  const currentDocs: UploadedDocument[] = existing.uploadedDocuments ?? [];
  const updatedDocs = currentDocs.filter((d) => d.id !== docId);

  await db
    .update(orgIdentity)
    .set({ uploadedDocuments: updatedDocs as any, updatedAt: new Date() })
    .where(eq(orgIdentity.id, existing.id));
}

/**
 * Store the AI-extracted identity on the org identity record.
 */
export async function setExtractedIdentity(extracted: ExtractedIdentity) {
  const ctx = await getActionContext();

  const existing = await (db as any).query.orgIdentity.findFirst({
    where: eq(orgIdentity.organizationId, ctx.organizationId),
  });

  if (!existing) return;

  await db
    .update(orgIdentity)
    .set({
      extractedIdentity: extracted as any,
      extractedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orgIdentity.id, existing.id));
}

// -- Public profile ---------------------------------------------------
// Bucketed metadata used to render anonymized opportunity listings.
// See docs/phase-2-public-funnel-spec.md.

export async function getOrgPublicProfile(): Promise<OrgPublicProfile | null> {
  const ctx = await getActionContext();
  const row = await (db as any).query.organization.findFirst({
    where: eq(organization.id, ctx.organizationId),
    columns: { publicProfile: true },
  });
  if (!row?.publicProfile) return null;
  const parsed = orgPublicProfileSchema.safeParse(row.publicProfile);
  return parsed.success ? parsed.data : null;
}

export async function updateOrgPublicProfile(input: unknown): Promise<OrgPublicProfile> {
  const ctx = await getActionContext();
  const parsed = orgPublicProfileSchema.parse(input);
  await db
    .update(organization)
    .set({ publicProfile: parsed, updatedAt: new Date().toISOString() })
    .where(eq(organization.id, ctx.organizationId));
  return parsed;
}
