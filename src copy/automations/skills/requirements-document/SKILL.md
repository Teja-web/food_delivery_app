---
name: requirements-document
description: Create the project's Requirements artifact using the canonical 6-section structure. Ask only for missing information, never invent content, then save through upsert_project_artifacts.
version: 1
plan_kind: story
tags: [platform, requirements, documentation, sdlc]
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_project_standards
  - mcp__coznt__upsert_project_artifacts
coznt:
  version: 1.0.0
  triggers:
    - User asks to create a requirements artifact or requirements document
    - Project is in the Requirements phase and the requirements artifact is missing
    - Stakeholders need the first formal requirements baseline for the project
  required_verbs:
    - get_my_context
    - upsert_project_artifacts
  min_autonomy: propose
---

# Requirements Document Workflow

Follow this skill manually. Do not use `invoke_skill` for this workflow because the process is interactive and must pause for user answers when information is missing.

## Goal

Create one project Requirements artifact in `project_artifacts` using the existing artifact flow. The document must be complete before saving.

## Required structure

Always generate the artifact with exactly these sections:

```md
# Requirements Document

## 1. Project Overview
### 1.1 Purpose
### 1.2 Problem Statement
### 1.3 Goals

## 2. Scope
### 2.1 In Scope
### 2.2 Out of Scope

## 3. Users and Roles

## 4. Functional Requirements

## 5. Non-Functional Requirements and Acceptance Criteria

## 6. Open Questions
### 6.1 What file format should be used for the requirements document (.md, .html, .txt, or .json)?
### 6.2 What font, heading sizes, and content text size should be used in the Word version?
```

## Workflow

### 1. Load context

Call `get_my_context`.

If the current stage is not Requirements or Design, still honor the request, but do not assume a requirements artifact already exists unless the project artifact record proves it.

### 2. Check for an existing Requirements artifact

Use the project artifact metadata returned by coznt. Treat a Requirements artifact as existing only when the current project has a real `project_artifacts` record whose `projectArtifactKind` is `requirements` or whose legacy identity is exactly the requirements lifecycle artifact.

If a valid current Requirements artifact already exists:
- stop
- tell the user it already exists
- do not regenerate it unless the user explicitly asks to update it

### 3. Inspect required information

Check whether each required section has enough user-provided information:

- `1.1 Purpose`
- `1.2 Problem Statement`
- `1.3 Goals`
- `2.1 In Scope`
- `2.2 Out of Scope`
- `3. Users and Roles`
- `4. Functional Requirements`
- `5. Non-Functional Requirements and Acceptance Criteria`
- `6.1` file format question
- `6.2` Word formatting question

### 4. Ask only the missing questions

Rules:

- ask only for sections that are missing
- wait for the user's answers before continuing
- do not invent, infer, or hallucinate missing information
- if some sections are already known, do not ask for them again
- keep questions short and grouped only when it helps the user answer efficiently

### 5. Generate the artifact body

Once every required section has enough information, write the document in the exact structure above.

Rules:

- preserve the numbered structure
- keep `6.1` and `6.2` as open questions unless the user explicitly answered them
- do not omit any required section
- do not save a partial draft

### 6. Save through the existing artifact flow

Call `upsert_project_artifacts` and save the Requirements artifact through the existing project artifact path.

Requirements for the save call:

- use the developer-selected artifact configuration values dynamically
- do not hardcode the artifact name
- do not hardcode the file type
- do not hardcode a database table name
- keep the artifact in the existing `project_artifacts` storage flow
- preserve the existing version/update behavior for the project

The payload must identify the artifact as the Requirements lifecycle artifact by kind, and must send the generated document body as the artifact content.

### 7. Final validation before save

Before saving, verify the body contains all of these sections:

- `1. Project Overview`
- `2. Scope`
- `3. Users and Roles`
- `4. Functional Requirements`
- `5. Non-Functional Requirements and Acceptance Criteria`
- `6. Open Questions`

If any required section is missing, stop and ask for the missing information instead of saving.

## Constraints

- Never create arbitrary requirements content.
- Never silently skip missing sections.
- Never store a partial Requirements artifact.
- Never bypass `upsert_project_artifacts`.
- Reuse the existing artifact storage architecture.
