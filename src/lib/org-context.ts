import { db } from "@/db/client";
import { orgIdentity } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Build a text block representing the organization's identity and values
 * for injection into AI agent prompts.
 */
export async function getOrgIdentityContext(organizationId: string): Promise<string | null> {
  const identity = await (db as any).query.orgIdentity.findFirst({
    where: eq(orgIdentity.organizationId, organizationId),
  });

  if (!identity) return null;

  const parts: string[] = [];

  if (identity.rawText) {
    parts.push(identity.rawText);
  }

  if (identity.uploadedDocuments?.length) {
    const docTexts = identity.uploadedDocuments
      .filter((d: any) => d.content)
      .map((d: any) => `[From ${d.filename}]\n${d.content}`);
    if (docTexts.length > 0) {
      parts.push(docTexts.join("\n\n"));
    }
  }

  // Include structured extracted identity fields when available
  const extracted = identity.extractedIdentity;
  if (extracted) {
    const sections: string[] = [];
    if (extracted.values?.length) sections.push(`**Core Values:** ${extracted.values.join(", ")}`);
    if (extracted.culturalSignals?.length) sections.push(`**Cultural Signals:** ${extracted.culturalSignals.join("; ")}`);
    if (extracted.hiringPrinciples?.length) sections.push(`**Hiring Principles:** ${extracted.hiringPrinciples.join("; ")}`);
    if (extracted.behavioralExpectations?.length) sections.push(`**Behavioral Expectations:** ${extracted.behavioralExpectations.join("; ")}`);
    if (extracted.redFlags?.length) sections.push(`**Red Flags:** ${extracted.redFlags.join("; ")}`);
    if (extracted.summary) sections.push(`**Summary:** ${extracted.summary}`);
    if (sections.length > 0) parts.push(sections.join("\n"));
  }

  if (parts.length === 0) return null;

  return `## ORG IDENTITY\n\nThe following describes this organization's culture, values, and what they look for in candidates:\n\n${parts.join("\n\n")}`;
}
