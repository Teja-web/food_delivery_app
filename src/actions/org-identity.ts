"use server";

import {
  getOrgIdentity as _getOrgIdentity,
  upsertOrgIdentity as _upsertOrgIdentity,
  addUploadedDocument as _addUploadedDocument,
  removeUploadedDocument as _removeUploadedDocument,
  setExtractedIdentity as _setExtractedIdentity,
} from "../operations/organization";
import { getActionContext } from "@/lib/auth/context";
import { storeFile } from "@/lib/storage";
import { extractTextFromFile } from "@/lib/markitdown";
import { generate, DEFAULT_MODEL } from "@/lib/ai";
import { orgIdentityExtractorAgent, orgIdentitySchema } from "@/automations/agents/definitions/org-identity-extractor";
import { orgIdentityExtractorPromptWithContext } from "@/automations/agents/prompts/org-identity-extractor";
import type { ExtractedIdentity, UploadedDocument } from "@/db/schema/organization";

export async function loadOrgIdentity() {
  return _getOrgIdentity();
}

export async function saveOrgIdentity(data: {
  rawText?: string;
  uploadedDocuments?: unknown;
}) {
  return _upsertOrgIdentity(data);
}

/**
 * Upload a document, extract its text via markitdown, and store it
 * on the org identity record.
 */
export async function uploadIdentityDocument(formData: FormData): Promise<UploadedDocument | null> {
  const ctx = await getActionContext();
  const file = formData.get("file") as File | null;
  if (!file) return null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeFile(ctx.organizationId, "uploads", file.name, buffer);

  let content: string | undefined;
  try {
    const extracted = await extractTextFromFile(stored.path);
    content = extracted.text;
  } catch {
    // File couldn't be extracted — store without content
  }

  const doc: UploadedDocument = {
    id: stored.url, // use storage URL as stable ID
    filename: file.name,
    url: stored.url,
    content,
    uploadedAt: new Date().toISOString(),
  };

  await _addUploadedDocument(doc);
  return doc;
}

/**
 * Remove a document from the org identity by its ID.
 */
export async function removeIdentityDocument(docId: string) {
  await _removeUploadedDocument(docId);
}

/**
 * Run AI extraction on rawText + uploaded document contents
 * to produce structured ExtractedIdentity.
 */
export async function extractIdentity(): Promise<ExtractedIdentity | null> {
  const identity = await _getOrgIdentity();
  if (!identity) return null;

  const parts: string[] = [];

  if (identity.rawText) {
    parts.push(identity.rawText);
  }

  if (identity.uploadedDocuments?.length) {
    for (const doc of identity.uploadedDocuments) {
      if (doc.content) {
        parts.push(`[From ${doc.filename}]\n${doc.content}`);
      }
    }
  }

  if (parts.length === 0) return null;

  const prompt = orgIdentityExtractorPromptWithContext(parts.join("\n\n---\n\n"));

  const result = await generate({
    agent: orgIdentityExtractorAgent,
    prompt,
    output: orgIdentitySchema,
  });

  const extracted = (result as any).object as ExtractedIdentity;
  await _setExtractedIdentity(extracted);
  return extracted;
}
