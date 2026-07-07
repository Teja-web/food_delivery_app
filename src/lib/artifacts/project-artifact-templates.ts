import type { ProjectArtifact, ProjectArtifactKind } from "@/db/schema/artifact";

export type LifecycleArtifactKey = "requirements" | "design" | "development";

type ProjectArtifactIdentity = Pick<ProjectArtifact, "category" | "metadata" | "name">;

export interface ArtifactValidationResult {
  ok: boolean;
  missingSections: string[];
}

export interface ArtifactQuestionDefinition {
  key: string;
  section: string;
  question: string;
}

export interface ProjectArtifactTemplateDefinition {
  artifactKind: Extract<ProjectArtifactKind, "requirements">;
  documentTitle: string;
  requiredSections: readonly string[];
  requiredQuestions: readonly ArtifactQuestionDefinition[];
}

const REQUIREMENTS_REQUIRED_SECTIONS = [
  "1. Project Overview",
  "1.1 Purpose",
  "1.2 Problem Statement",
  "1.3 Goals",
  "2. Scope",
  "2.1 In Scope",
  "2.2 Out of Scope",
  "3. Users and Roles",
  "4. Functional Requirements",
  "5. Non-Functional Requirements and Acceptance Criteria",
  "6. Open Questions",
  "6.1 What file format should be used for the requirements document (.md, .html, .txt, or .json)?",
  "6.2 What font, heading sizes, and content text size should be used in the Word version?",
] as const;

export const REQUIREMENTS_ARTIFACT_TEMPLATE: ProjectArtifactTemplateDefinition = {
  artifactKind: "requirements",
  documentTitle: "Requirements Document",
  requiredSections: REQUIREMENTS_REQUIRED_SECTIONS,
  requiredQuestions: [
    {
      key: "purpose",
      section: "1.1 Purpose",
      question: "What is the purpose of this project?",
    },
    {
      key: "problemStatement",
      section: "1.2 Problem Statement",
      question: "What problem is this project solving?",
    },
    {
      key: "goals",
      section: "1.3 Goals",
      question: "What are the main goals for this project?",
    },
    {
      key: "inScope",
      section: "2.1 In Scope",
      question: "What is in scope for this project?",
    },
    {
      key: "outOfScope",
      section: "2.2 Out of Scope",
      question: "What is out of scope for this project?",
    },
    {
      key: "usersAndRoles",
      section: "3. Users and Roles",
      question: "Who will use this system, and what are their roles?",
    },
    {
      key: "functionalRequirements",
      section: "4. Functional Requirements",
      question: "What functional requirements must the system support?",
    },
    {
      key: "nonFunctionalRequirementsAndAcceptanceCriteria",
      section: "5. Non-Functional Requirements and Acceptance Criteria",
      question:
        "What non-functional requirements and acceptance criteria must be included?",
    },
    {
      key: "requirementsFileFormat",
      section: "6.1 What file format should be used for the requirements document (.md, .html, .txt, or .json)?",
      question:
        "Which file format should be used for the requirements document: .md, .html, .txt, or .json?",
    },
    {
      key: "wordFormatting",
      section: "6.2 What font, heading sizes, and content text size should be used in the Word version?",
      question:
        "What font, heading sizes, and content text size should be used in the Word version?",
    },
  ],
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasSection(body: string, section: string): boolean {
  return normalizeText(body).includes(normalizeText(section));
}

function isProjectArtifactKind(value: unknown): value is ProjectArtifactKind {
  return value === "requirements" || value === "design" || value === "custom";
}

export function normalizeArtifactStem(name: string): string {
  return name.trim().toLowerCase().replace(/\.[^.]+$/, "");
}

export function resolveProjectArtifactKind(row: ProjectArtifactIdentity): ProjectArtifactKind | null {
  if (isProjectArtifactKind(row.metadata.projectArtifactKind)) {
    return row.metadata.projectArtifactKind;
  }

  if (row.category !== "project-exclusive") return null;

  const normalizedTitle =
    typeof row.metadata.title === "string" ? normalizeText(row.metadata.title) : "";
  const normalizedStem = normalizeArtifactStem(row.name);

  if (normalizedStem === "requirements" || normalizedTitle === "project requirements") {
    return "requirements";
  }
  if (normalizedStem === "design" || normalizedTitle === "project design") {
    return "design";
  }

  return null;
}

export function resolveLifecycleArtifactKey(input: {
  name: string;
  projectArtifactKind?: ProjectArtifactKind | null;
}): LifecycleArtifactKey | null {
  if (input.projectArtifactKind === "requirements" || input.projectArtifactKind === "design") {
    return input.projectArtifactKind;
  }

  const normalizedStem = normalizeArtifactStem(input.name);
  if (
    normalizedStem === "requirements" ||
    normalizedStem === "design" ||
    normalizedStem === "development"
  ) {
    return normalizedStem;
  }

  return null;
}

export function getProjectArtifactTemplate(
  artifactKind: ProjectArtifactKind | null | undefined,
): ProjectArtifactTemplateDefinition | null {
  if (artifactKind === "requirements") return REQUIREMENTS_ARTIFACT_TEMPLATE;
  return null;
}

export function validateProjectArtifactBody(input: {
  artifactKind: ProjectArtifactKind | null | undefined;
  body: string;
}): ArtifactValidationResult {
  const template = getProjectArtifactTemplate(input.artifactKind);
  if (!template) {
    return { ok: true, missingSections: [] };
  }

  const missingSections = template.requiredSections.filter(
    (section) => !hasSection(input.body, section),
  );

  return {
    ok: missingSections.length === 0,
    missingSections,
  };
}
