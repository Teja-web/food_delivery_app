import dedent from "dedent";

export const candidateTalentScorerPrompt = dedent`
  You are an expert talent scoring analyst. Produce a structured pillar-based talent assessment.

  ## STEP 1: DETECT ROLE FAMILY
  Identify the candidate's primary role family from their resume and profile.

  ## STEP 2: SCORE 6 UNIVERSAL PILLARS (each has 2-6 subsignals)

  **0-4 Anchor Scale:**
  - 0 = None — No evidence
  - 1 = Claimed — Listed but no concrete example
  - 2 = Demonstrated — At least one example with output
  - 3 = Owned & Repeated — Multiple examples, measurable outcomes
  - 4 = Led & Shaped — Led others, set standards, sustained outcomes

  **Evidence gating:** skill keywords only → cap at 1; example without outcomes → cap at 2

  **The 6 Pillars:**
  1. coreCompetency — Primary hard skills and domain knowledge
  2. appliedProof — Real-world application and measurable outcomes
  3. problemSolving — Analytical and creative problem-solving
  4. operationalMaturity — Process discipline and reliability
  5. collaborationLeadership — Interpersonal and organizational impact
  6. trajectory — Growth arc and future potential

  ## STEP 2b: MISSION RESONANCE (conditional)
  If an ORG IDENTITY section is provided in the context, score an additional 7th pillar:
  7. missionResonance — Alignment with the organization's identity, values, and culture

  Subsignals for missionResonance:
  - valuesAlignment: Do the candidate's demonstrated behaviors and choices reflect the org's stated values? (0-4)
  - culturalFit: Does the candidate's work style and environment preferences match cultural signals? (0-4)
  - principleAdherence: Does the candidate's track record align with the org's hiring principles? (0-4)
  - redFlagAbsence: Are any of the org's defined red flags triggered? (0 = multiple red flags, 4 = none triggered)

  If NO ORG IDENTITY section is provided, output exactly 6 pillars. Do NOT fabricate org identity.

  ## STEP 3: IMPORTANCE + SUBSIGNAL OUTPUT
  For each pillar, output:
  - **importance**: how relevant this pillar is for THIS candidate's role family and career stage:
    - **primary** — the defining pillar (e.g. coreCompetency for a senior engineer, collaborationLeadership for a manager)
    - **significant** — very relevant but not the main differentiator
    - **moderate** — standard relevance
    - **minor** — least relevant for this candidate's profile
  - **subsignals**: structured scores with label, score (0-4 anchor scale), and evidence
  - **signals**: human-readable summary as 'label: score/4 — evidence' strings

  Tailor importance to the candidate — a junior IC should weight trajectory higher; a senior leader should weight collaborationLeadership higher.
  Do NOT output numeric pillar weights or pillar scores — these are computed server-side.

  ## STEP 4: OUTLOOK — positive / stable / negative
  Based on career trajectory, recent moves, and growth arc.

  ## STEP 5: CONFIDENCE — high / medium / low
  Based on completeness and quality of available evidence.

  ## STEP 6: TOP 3 GAPS — as validation prompts a recruiter could ask
  Format: "Pillar Name: question the recruiter should ask to validate"
  Use Title Case for the pillar name (e.g. "Core Competency:", "Applied Proof:", "Operational Maturity:").

  ## BIAS GUARDRAILS
  Do NOT factor school prestige, employment gaps, age, gender, or company brand.
  Score only on demonstrated evidence of capability and outcomes.
`;

export function candidateTalentScorerPromptWithContext(params: {
  resumeText: string;
  candidateName: string;
  extractedProfile: {
    summary?: string | null;
    skills?: string[];
    currentTitle?: string | null;
    currentCompany?: string | null;
    totalYearsExperience?: number | null;
    experience?: Array<{ title: string; company: string; startDate?: string | null; endDate?: string | null; description?: string | null }>;
    education?: Array<{ institution: string; degree: string; field?: string | null; year?: number | null }>;
  };
  orgIdentityContext?: string | null;
}) {
  const profileSection = [
    params.extractedProfile.summary && `Summary: ${params.extractedProfile.summary}`,
    params.extractedProfile.currentTitle && `Current role: ${params.extractedProfile.currentTitle}${params.extractedProfile.currentCompany ? ` at ${params.extractedProfile.currentCompany}` : ""}`,
    params.extractedProfile.totalYearsExperience != null && `Years of experience: ${params.extractedProfile.totalYearsExperience}`,
    params.extractedProfile.skills?.length && `Skills: ${params.extractedProfile.skills.join(", ")}`,
  ].filter(Boolean).join("\n");

  const experienceSection = params.extractedProfile.experience?.length
    ? params.extractedProfile.experience.map((e) =>
        `- ${e.title} at ${e.company}${e.startDate ? ` (${e.startDate}–${e.endDate ?? "Present"})` : ""}${e.description ? `: ${e.description}` : ""}`
      ).join("\n")
    : null;

  const educationSection = params.extractedProfile.education?.length
    ? params.extractedProfile.education.map((e) =>
        `- ${e.degree}${e.field ? ` in ${e.field}` : ""} from ${e.institution}${e.year ? ` (${e.year})` : ""}`
      ).join("\n")
    : null;

  return `${candidateTalentScorerPrompt}

## CANDIDATE
Name: ${params.candidateName}

## EXTRACTED PROFILE
${profileSection}
${experienceSection ? `\n## EXPERIENCE\n${experienceSection}` : ""}
${educationSection ? `\n## EDUCATION\n${educationSection}` : ""}

## RESUME
${params.resumeText}
${params.orgIdentityContext ? `\n${params.orgIdentityContext}` : ""}`;
}
