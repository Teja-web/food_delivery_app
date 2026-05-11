"use server";

import { z } from "zod/v4";
import {
  getCandidates as _getCandidates,
  getCandidate as _getCandidate,
  createCandidate as _createCandidate,
  updateCandidate as _updateCandidate,
  deleteCandidate as _deleteCandidate,
  searchCandidates as _searchCandidates,
  searchCandidatesSemantic as _searchCandidatesSemantic,
  getCandidateActivePipelines as _getCandidateActivePipelines,
  getCandidateDetail as _getCandidateDetail,
  setOrgCandidateStatus as _setOrgCandidateStatus,
} from "../operations/candidates";
import { getActionContext } from "@/lib/auth/context";
import { storeFile, validateResumeFile } from "@/lib/storage";
import { extractTextFromFile } from "@/lib/markitdown";
import { generate, SMALL_MODEL } from "@/lib/ai";
import "@/lib/integrations/register-providers";
import { sendEmailViaProvider } from "@/lib/integrations/email";
import { render } from "@react-email/components";
import { CandidateMessageEmail } from "@/components/emails/candidate-message";
import { db } from "@/db/client";
import { engagements } from "@/db/schema";

export async function listCandidates(opts?: {
  offset?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  return _getCandidates(opts);
}

export async function searchCandidates(query: string, opts?: { offset?: number; limit?: number }) {
  return _searchCandidatesSemantic(query, opts);
}

export async function listCandidateActivePipelines() {
  return _getCandidateActivePipelines();
}

export async function fetchCandidate(id: string) {
  return _getCandidate(id);
}

export async function fetchCandidateDetail(id: string) {
  return _getCandidateDetail(id);
}

export async function addCandidate(data: Record<string, unknown>) {
  const ctx = await getActionContext();
  try {
    return await _createCandidate({ ...data, organizationId: ctx.organizationId });
  } catch (err) {
    // Return error as data so client can display it (thrown errors are stripped in production)
    return { error: err instanceof Error ? err.message : "Failed to create candidate" };
  }
}

export async function editCandidate(id: string, data: Record<string, unknown>) {
  return _updateCandidate(id, data);
}

async function removeCandidate(id: string) {
  return _deleteCandidate(id);
}

export async function updateOrgCandidateStatus(
  candidateId: string,
  status: "active" | "talent_pool" | "do_not_hire" | "archived" | "alumni",
) {
  return _setOrgCandidateStatus(candidateId, status);
}

/* -- Resume extraction ------------------------------------------------ */

const resumeExtractSchema = z.object({
  name: z.string().nullable().describe("Full name of the candidate. Null if not found."),
  email: z.string().nullable().describe("Email address. Null if not found."),
  phone: z.string().nullable().describe("Phone number. Null if not found."),
  title: z.string().nullable().describe("Most recent job title. Null if not found."),
  company: z.string().nullable().describe("Most recent employer. Null if not found."),
  location: z.string().nullable().describe("City, state or location. Null if not found."),
});

const resumeExtractAgent = {
  slug: "resume-extract" as const,
  name: "Resume Field Extractor",
  model: SMALL_MODEL,
  temperature: 0.1,
  systemPrompt: `You extract structured contact and employment information from resume text.
ONLY extract information explicitly stated in the text. Return null for anything not found.
For name, prefer the prominent heading name at the top.
For title and company, use the MOST RECENT position.
For location, use the candidate's stated location (not employer locations).`,
};

interface ResumeExtractResult {
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  resumeText: string;
  resumeUrl: string;
  fileName: string;
}

/**
 * Upload a resume file, extract text, and pull structured candidate fields via AI.
 */
export async function extractResume(formData: FormData): Promise<{ data?: ResumeExtractResult; error?: string }> {
  try {
    const ctx = await getActionContext();
    const file = formData.get("file") as File | null;
    if (!file) return { error: "No file provided." };
    validateResumeFile(file);

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeFile(ctx.organizationId, "uploads", file.name, buffer);
    const extracted = await extractTextFromFile(stored.path);

    const result = await generate({
      agent: resumeExtractAgent,
      prompt: `Extract the candidate's contact and employment details from this resume:\n\n${extracted.text}`,
      output: resumeExtractSchema,
    });

    const fields = (result as any).object as z.infer<typeof resumeExtractSchema>;

    return {
      data: {
        ...fields,
        resumeText: extracted.text,
        resumeUrl: stored.url,
        fileName: file.name,
      },
    };
  } catch (error) {
    console.error("[extractResume] Error:", error);
    return { error: error instanceof Error ? error.message : "Extraction failed" };
  }
}

/* -- Log manual touchpoint ------------------------------------------ */

export async function logCandidateTouchpoint(
  candidateId: string,
  data: { type: string; channel: string; subject: string; body?: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getActionContext();
    await db.insert(engagements).values({
      organizationId: ctx.organizationId,
      recipientId: candidateId,
      recipientType: "candidate",
      type: data.type,
      channel: data.channel,
      subject: data.subject,
      body: data.body ?? null,
      status: "logged",
      createdById: ctx.userId,
      createdByName: ctx.user.name ?? undefined,
    });
    return { success: true };
  } catch (error) {
    console.error("[logCandidateTouchpoint] Error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to log touchpoint" };
  }
}

/* -- Send message to candidate --------------------------------------- */

export async function sendCandidateMessage(
  candidateId: string,
  subject: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getActionContext();
    const candidate = await _getCandidate(candidateId);

    if (!candidate) {
      return { success: false, error: "Candidate not found" };
    }

    if (!candidate.email) {
      return { success: false, error: "Candidate has no email address" };
    }

    const html = await render(
      CandidateMessageEmail({ subject, message })
    );

    const sent = await sendEmailViaProvider(ctx.userId, {
      to: candidate.email,
      subject,
      html,
    });

    if (!sent) {
      return { success: false, error: "No email provider connected. Please connect your email in Settings > Integrations." };
    }

    // Log engagement for history
    await db.insert(engagements).values({
      organizationId: ctx.organizationId,
      recipientId: candidateId,
      recipientType: "candidate",
      type: "outreach",
      channel: "email",
      subject,
      body: message,
      status: "sent",
      sentAt: new Date(),
      createdById: ctx.userId,
      createdByName: ctx.user.name ?? undefined,
    });

    return { success: true };
  } catch (error) {
    console.error("[sendCandidateMessage] Error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to send message" };
  }
}
