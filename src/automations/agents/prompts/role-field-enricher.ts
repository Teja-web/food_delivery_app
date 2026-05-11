import dedent from "dedent";

export const roleFieldEnricherPrompt = dedent`
  You are a professional HR copywriter who helps create compelling job descriptions and business cases.

  CRITICAL RULES:
  - ONLY use information provided in the context and current text. Do NOT invent or hallucinate details.
  - If a field is missing from context, do NOT guess it — omit it or leave it generic.
  - Your job is to enhance the WRITING QUALITY of what's provided, not to add new facts.
  - Preserve all specific details from the original text (technologies, requirements, numbers, etc.).
  - Do not fabricate company names, team sizes, specific technologies, or responsibilities not mentioned.
  - If the current text is empty or very short, generate ONLY from the provided context fields — keep it brief rather than inventing details.
`;

export function roleFieldEnricherPromptWithContext(
  fieldType: "description" | "businessCase",
  currentValue: string,
  context: {
    title?: string;
    team?: string;
    location?: string;
    department?: string;
    employmentType?: string;
    headcount?: number;
    businessCase?: string;
    description?: string;
  },
): string {
  const contextParts: string[] = [];
  if (context.title) contextParts.push(`Role: ${context.title}`);
  if (context.department) contextParts.push(`Department: ${context.department}`);
  if (context.team) contextParts.push(`Team: ${context.team}`);
  if (context.location) contextParts.push(`Location: ${context.location}`);
  if (context.employmentType) contextParts.push(`Employment type: ${context.employmentType}`);
  if (context.headcount && context.headcount > 1) contextParts.push(`Headcount: ${context.headcount}`);
  // Cross-reference the other field for richer context
  if (fieldType === "description" && context.businessCase) contextParts.push(`Business case:\n${context.businessCase}`);
  if (fieldType === "businessCase" && context.description) contextParts.push(`Role description:\n${context.description}`);

  const contextText = contextParts.length > 0 ? `\n\nContext (use ONLY this information):\n${contextParts.join("\n")}` : "";

  if (fieldType === "description") {
    return `Enhance the following job description to be more compelling, clear, and comprehensive. Keep the core content but improve the writing, add structure, and make it more engaging for potential candidates. Do NOT invent details not present in the context or current text. Output only the enhanced description, no explanations.${contextText}\n\nCurrent description:\n${currentValue || "(empty — write a brief job description using ONLY the context above. Do not invent any details.)"}`;
  }

  return `Enhance the following business case for why we're hiring for this role. Make it more compelling, strategic, and clear. Focus on business impact, team needs, and growth opportunities. Do NOT invent details not present in the context or current text. Output only the enhanced text, no explanations.${contextText}\n\nCurrent text:\n${currentValue || "(empty — write a brief business case using ONLY the context above. Do not invent any details.)"}`;
}
