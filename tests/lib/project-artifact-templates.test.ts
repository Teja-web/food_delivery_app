import { describe, expect, it } from "vitest";

import {
  resolveLifecycleArtifactKey,
  resolveProjectArtifactKind,
  validateProjectArtifactBody,
} from "@/lib/artifacts/project-artifact-templates";

describe("project artifact templates", () => {
  it("validates the canonical Requirements structure", () => {
    const body = `
# Requirements Document

## 1. Project Overview
### 1.1 Purpose
Purpose text
### 1.2 Problem Statement
Problem text
### 1.3 Goals
Goals text

## 2. Scope
### 2.1 In Scope
Scope in
### 2.2 Out of Scope
Scope out

## 3. Users and Roles
Users text

## 4. Functional Requirements
Functional text

## 5. Non-Functional Requirements and Acceptance Criteria
NFR text

## 6. Open Questions
### 6.1 What file format should be used for the requirements document (.md, .html, .txt, or .json)?
Open question one
### 6.2 What font, heading sizes, and content text size should be used in the Word version?
Open question two
`;

    expect(
      validateProjectArtifactBody({
        artifactKind: "requirements",
        body,
      }),
    ).toEqual({
      ok: true,
      missingSections: [],
    });
  });

  it("rejects incomplete Requirements artifacts", () => {
    const validation = validateProjectArtifactBody({
      artifactKind: "requirements",
      body: `
# Requirements Document
## 1. Project Overview
### 1.1 Purpose
Purpose text
`,
    });

    expect(validation.ok).toBe(false);
    expect(validation.missingSections).toContain("2. Scope");
    expect(validation.missingSections).toContain("6. Open Questions");
  });

  it("resolves lifecycle artifact kind from explicit metadata first", () => {
    expect(
      resolveProjectArtifactKind({
        name: "prd-v2.html",
        category: "project-exclusive",
        metadata: {
          title: "Customer PRD",
          projectArtifactKind: "requirements",
        },
      }),
    ).toBe("requirements");
  });

  it("does not infer lifecycle kind from loose title matches", () => {
    expect(
      resolveProjectArtifactKind({
        name: "requirements-workshop-notes.md",
        category: "project-exclusive",
        metadata: {
          title: "Requirements Workshop Notes",
        },
      }),
    ).toBeNull();
  });

  it("supports lifecycle resolution across dynamic file types", () => {
    expect(
      resolveLifecycleArtifactKey({
        name: "requirements.html",
        projectArtifactKind: "requirements",
      }),
    ).toBe("requirements");
  });
});
