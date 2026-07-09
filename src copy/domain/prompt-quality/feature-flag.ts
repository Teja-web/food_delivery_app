/**
 * Feature flag for the agent-loop governance surface (prompt capture +
 * rate verbs + Trust-tab card). Default off — flip to "true" / "1" per
 * deployment.
 */
export function isPromptGovernanceEnabled(): boolean {
  const v = process.env.COZNT_PROMPT_GOVERNANCE_ENABLED;
  if (!v) return false;
  return v === "1" || v.toLowerCase() === "true";
}
