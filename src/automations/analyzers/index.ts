import type { OutcomeAnalyzer } from "./types";
import { mcqAnalyzer } from "./mcq";
import { subjectiveAnalyzer } from "./subjective";
import { personalityAnalyzer } from "./personality";
import { codingAnalyzer } from "./coding";
import { caseStudyAnalyzer } from "./case-study";
import { interviewRubricAnalyzer } from "./interview-rubric";

// -- Registry ----------------------------��---------------------------

const registry = new Map<string, OutcomeAnalyzer>();

function registerAnalyzer(analyzer: OutcomeAnalyzer) {
  registry.set(analyzer.type, analyzer);
}

export function getAnalyzer(type: string): OutcomeAnalyzer {
  return registry.get(type) ?? registry.get("subjective")!;
}

// -- Type resolution -------------------------------------------------

const TYPE_TO_ANALYZER: Record<string, string> = {
  technical: "subjective",
  aptitude: "mcq",
  coding: "coding",
  case_study: "case_study",
  interview_rubric: "interview_rubric",
  personality: "personality",
};

export function resolveAnalyzerType(assessment: {
  type?: string | null;
}): string {
  if (assessment.type) {
    return TYPE_TO_ANALYZER[assessment.type] ?? "subjective";
  }
  return "subjective";
}

// -- Register built-in analyzers -----------------------------------���-

registerAnalyzer(mcqAnalyzer);
registerAnalyzer(subjectiveAnalyzer);
registerAnalyzer(personalityAnalyzer);
registerAnalyzer(codingAnalyzer);
registerAnalyzer(caseStudyAnalyzer);
registerAnalyzer(interviewRubricAnalyzer);
