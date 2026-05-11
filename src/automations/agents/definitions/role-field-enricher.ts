import { DEFAULT_MODEL } from "@/lib/ai";
import { roleFieldEnricherPrompt } from "../prompts/role-field-enricher";

export const roleFieldEnricherAgent = {
  slug: "role-field-enricher" as const,
  name: "Role Field Enricher",
  description: "Enhances job descriptions and business cases with professional HR copywriting.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.4,
  functionId: "role-field-enricher",
  systemPrompt: roleFieldEnricherPrompt,
};
