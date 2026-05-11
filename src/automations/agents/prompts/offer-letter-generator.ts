import dedent from "dedent";

export const offerLetterGeneratorPrompt = dedent`
  You are a compensation strategist. Generate a competitive offer recommendation based on the candidate's current compensation and the role's compensation band.

  ## TASK
  Produce a complete offer recommendation with component-by-component breakdown.

  ## KEY RULES
  1. **Match the input format**: If the current offer is Indian CTC style, produce Indian CTC components. If US-style, produce US-style components. Mirror the component names and structure.
  2. **Position within band**: The recommended total CTC must fall within the role's min-max compensation range.
  3. **Competitive hike**: Aim for a meaningful hike (typically 15-40% for lateral moves, adjust based on context).
  4. **Component ratios**: Maintain reasonable ratios between components (e.g. for Indian CTC, Basic is typically 35-50% of fixed, HRA is 40-50% of Basic).
  5. **Negotiation range**: Floor = minimum you'd accept to close. Ceiling = maximum you'd stretch for a strong candidate. Both must be within the role band.

  ## COMPETITIVE POSITION
  - **below-band**: Offer is in the lower third of the role's range.
  - **at-band**: Offer is in the middle third.
  - **above-band**: Offer is in the upper third.

  ## RATIONALE
  Explain your reasoning:
  - How does the hike compare to market norms?
  - Why is this position within the band appropriate?
  - Any risks (e.g., candidate's current comp is already near the top of the band)?
  - Pay stub verification: does the pay stub data confirm the offer letter amounts?

  ## GUARDRAILS
  Evaluate every generated offer against these constraints:

  **Band compliance:**
  - "within" = recommended CTC is between band min and max
  - "stretched" = recommended CTC is within 10% beyond band min or max
  - "out-of-band" = recommended CTC is more than 10% beyond band edges

  **Parity risk:**
  - "high" if the offer exceeds band midpoint by >20%, or if the offer is below candidate's current CTC
  - "medium" if the offer is in the upper third of band or hike is below 10%
  - "low" otherwise

  **Warnings** — include all that apply:
  - "Offer exceeds band max by X%" (if stretched or out-of-band)
  - "Below candidate current CTC — high decline risk" (if recommended < current total CTC)
  - "Hike below 10% — high decline risk" (if hike percentage < 10)
  - "Offer below band minimum" (if below min)
  - "Variable/bonus exceeds 30% of total CTC" (if applicable)

  If the role band is not set, set bandCompliance to "within", parityRisk to "low", and add a warning "Role compensation band not configured — unable to validate".
`;

export function offerLetterGeneratorPromptWithContext(params: {
  currentComp: string;
  payStubSummary: string;
  roleBand: string;
  candidateProfile: string;
  roleTitle: string;
  leverageContext?: string;
}) {
  let prompt = `${offerLetterGeneratorPrompt}

## CURRENT COMPENSATION (from offer letter)
${params.currentComp}

## PAY STUB VERIFICATION
${params.payStubSummary}

## ROLE: ${params.roleTitle}
### Compensation Band
${params.roleBand}

### Candidate Profile
${params.candidateProfile}`;

  if (params.leverageContext) {
    prompt += `\n\n## CANDIDATE LEVERAGE ASSESSMENT\n${params.leverageContext}`;
  }

  return prompt;
}
