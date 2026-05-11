/**
 * Portal Coach Tools
 *
 * Candidate-scoped read-only tools for the portal coach agent.
 * All tools apply stripSensitiveIntelligence before returning data.
 *
 * Tools are created per-request via createPortalCoachTools() to ensure
 * request isolation — each request gets its own context via closure.
 */

import { z } from "zod";
import { createTool } from "../../ask/create-tool";
import {
  getPortalProfile,
  listPortalOpportunities,
  listPortalInterviews,
  listPortalPrepHistory,
  getPortalPulseStats,
  getPortalGrowthTimeline,
  listPortalOffersForCandidate,
} from "@/operations/portal";
import { generateCandidateAdvisory } from "@/domain/portal/advisory";
import { stripSensitiveIntelligence } from "@/domain/portal/privacy";

interface PortalToolContext {
  email: string;
  candidateId: string;
  organizationId: string;
  timezone: string;
}

/**
 * Creates portal coach tools with the given context bound via closure.
 * This ensures request isolation — each request creates its own tools
 * with its own context, avoiding race conditions from shared state.
 */
export function createPortalCoachTools(ctx: PortalToolContext) {
  return {
    getMyProfile: createTool({
      description: "Get the candidate's own profile including skills, experience, summary, location, and career preferences. All intelligence data is privacy-stripped.",
      inputSchema: z.object({}),
      execute: async () => {
        const profile = await getPortalProfile(ctx.email);
        if (!profile) return { error: "No profile found" };
        return {
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          location: profile.location,
          resumeUploaded: Boolean(profile.candidate.resumeUrl || profile.candidate.resumeText),
          profile: stripSensitiveIntelligence(profile.candidate.profile ?? {}),
          skills: profile.candidate.skills ?? [],
          tags: profile.tags,
        };
      },
    }),

    getMyOpportunities: createTool({
      description: "Get the candidate's active job opportunities with match scores, stages, and fit analysis. Match intelligence is privacy-stripped (no internal scores, red flags, or recruiter notes).",
      inputSchema: z.object({}),
      execute: async () => {
        const opps = await listPortalOpportunities(ctx.email);
        return opps.map((opp) => ({
          applicationId: opp.applicationId,
          jobTitle: opp.jobTitle,
          jobLocation: opp.jobLocation,
          stage: opp.stage,
          fitScore: opp.fitScore,
          recommendation: opp.recommendation,
          signal: opp.signal,
          gaps: opp.gaps,
          summary: opp.summary,
        }));
      },
    }),

    getMyInterviews: createTool({
      description: "Get the candidate's scheduled and past interviews with dates, types, and interview intelligence (focus areas, preparation topics). Intelligence is privacy-stripped.",
      inputSchema: z.object({}),
      execute: async () => {
        const interviews = await listPortalInterviews(ctx.email);
        return interviews.map((iv) => {
          // Format scheduledAt in user's local timezone for consistent display
          const scheduledAtFormatted = iv.scheduledAt
            ? new Date(iv.scheduledAt).toLocaleString("en-US", {
                timeZone: ctx.timezone,
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })
            : null;
          return {
            interviewId: iv.interviewId,
            jobTitle: iv.jobTitle,
            scheduledAt: scheduledAtFormatted,
            status: iv.status,
            location: iv.location,
            meetingLink: iv.meetingLink,
            scorecard: {},
          };
        });
      },
    }),

    getMyPrepHistory: createTool({
      description: "Get the candidate's interview prep sessions with readiness scores, types (practice questions vs mock interview), and dates. Use this to understand how the candidate has been preparing.",
      inputSchema: z.object({}),
      execute: async () => {
        return listPortalPrepHistory(ctx.candidateId);
      },
    }),

    getMyGrowthTimeline: createTool({
      description: "Get the candidate's growth timeline showing score progression across prep sessions and assessments over time. Use this to identify trends, celebrate improvements, and suggest areas to focus on.",
      inputSchema: z.object({}),
      execute: async () => {
        return getPortalGrowthTimeline([ctx.candidateId]);
      },
    }),

    getMyAdvisory: createTool({
      description: "Get the AI-generated career advisory: profile insights (top strengths, growth areas, skill narrative, market position), opportunity fit analysis per job, and interview readiness (topics to expect, practice prompts, prep checklist).",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await generateCandidateAdvisory({
          organizationId: ctx.organizationId,
          candidateId: ctx.candidateId,
        });
        return result;
      },
    }),

    getMyPulseStats: createTool({
      description: "Get aggregate stats: total interviews, completed interviews, total prep sessions, average readiness score, prep streak, readiness timeline, and interview timeline.",
      inputSchema: z.object({}),
      execute: async () => {
        return getPortalPulseStats(ctx.email);
      },
    }),

    getMyOffers: createTool({
      description: "Get the candidate's job offers with status (sent, accepted, declined, countered), validity dates, and associated role details. Use when the candidate asks about offers, compensation, or offer status.",
      inputSchema: z.object({}),
      execute: async () => {
        const offers = await listPortalOffersForCandidate(ctx.email);
        return offers.map((o) => ({
          offerId: o.offerId,
          jobTitle: o.jobTitle,
          orgName: o.orgName,
          status: o.status,
          validUntil: o.validUntil
            ? new Date(o.validUntil).toLocaleString("en-US", {
                timeZone: ctx.timezone,
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : null,
          viewUrl: `/roles/${o.jobId}/offer`,
        }));
      },
    }),
  };
}
