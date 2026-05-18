---
name: CI/CD Pipeline Authoring
description: Author a tailored CI/CD pipeline file (GitHub Actions, Azure DevOps, GitLab CI, or Jenkins) by combining the `generate_pipeline` templater with project-specific customization. Use when: "set up CI", "pipeline file", "draft a CI config", "new project needs a pipeline". Voice triggers (speech-to-text aliases): "set up CI", "pipeline yaml", "build config".
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_design_context
  - mcp__coznt__get_plans
  - mcp__coznt__generate_pipeline
  - mcp__coznt__invoke_skill
  - mcp__coznt__upsert_plan
  - mcp__coznt__submit_for_approval
coznt:
  version: 1.0.0
  triggers:
    - User mentions "CI", "pipeline", "build config", "GitHub Actions", "Azure Pipelines", "GitLab CI", "Jenkins"
    - A new project has no pipeline file checked in
    - Existing pipeline drifted and team wants a clean baseline to diff against
    - Platform team rolling out a new pipeline convention
  required_verbs:
    - get_my_context
    - get_design_context
    - get_plans
    - generate_pipeline
    - invoke_skill
    - upsert_plan
    - submit_for_approval
  min_autonomy: propose
---

# CI/CD Pipeline Authoring

Compose `generate_pipeline` (baseline templater) with project-specific customization, then file as a `cicd_pipeline` plan for review. The LLM customization runs server-side via `invoke_skill`.

## When to use

- New project needs its first pipeline file.
- Existing pipeline drifted; the team wants a clean baseline.
- Platform team is rolling out a new pipeline convention and wants per-project drafts.

## When NOT to use

- **Tech stack unknown after context-gathering.** Ask the user; don't guess between `node` / `python` / `java` / `go` / `dotnet`.
- **CI platform unknown.** Do not default to GitHub Actions silently — ask.
- **The user wants to *apply* the pipeline, not draft it.** Coznt files a reviewable plan; the actual commit happens through a human PR in the repo.
- **Pipeline changes for an *existing* well-maintained pipeline** where a small diff is the right answer — this skill is for new files / clean baselines, not surgical edits.

## Steps

### 1. Load context
Call `get_my_context` and `get_design_context`. Capture project name, repo URL, and any deploy targets named in features.

### 2. Inspect existing plans
Call `get_plans { kind: "release_plan", status: "in_progress" }` and `get_plans { kind: "adr" }`. ADRs frequently name the container story (Docker / K8s) and target environments.

### 3. Confirm inputs with user
You MUST have these four before continuing — ask if any are missing:
- `platform`: github_actions | azure_devops | gitlab_ci | jenkins
- `techStack`: node | python | java | go | dotnet
- `includeDocker`: true | false
- `includeKubernetes`: true | false

### 4. Render baseline
Call `generate_pipeline` with the four inputs. Returns `{ filename, content }`. Treat content as starting point, not the answer.

### 5. Invoke server-side customization
Call `invoke_skill` with:
```
slug: "cicd-pipeline-authoring"
input: {
  projectId,
  baselineContent: <from step 4>,
  baselineFilename: <from step 4>,
  projectBranches,         // e.g. ["main", "develop"]; ask if unknown
  deployTargets,           // from step 2 + ask user
  secrets                  // names only — never values
}
```
Server adapts branches, secrets, deploy stages, and adds project-specific matrices. Returns `{ content, confidence, customizations[] }`.

### 6. Route based on confidence
- `confidence >= 0.7` → present customized YAML to user.
- `confidence < 0.7` → `submit_for_approval` with the customizations list attached.

### 7. File the pipeline
Once approved, call `upsert_plan`:
```
upsert_plan {
  kind: "cicd_pipeline",
  slug: "pipeline-<project-slug>-<platform>",
  title: "CI/CD pipeline — <project-name> (<platform>)",
  body: <customized YAML in a fenced code block + customizations list>,
  changeNote: "Drafted from <platform>/<techStack> template + N project-specific changes"
}
```

## Constraints

- **Never write secret values.** Reference secrets by name only (`${{ secrets.NPM_TOKEN }}`); the actual value is the customer's responsibility.
- **Do not commit the pipeline file directly.** Coznt files a reviewable plan; a human opens the PR.
- **Don't invent deploy targets.** If the project's environments aren't named in features / ADRs, ask the user.
- **Container assumptions live in ADRs.** Don't assume Docker / K8s — read the ADR catalog first.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `generate_pipeline` errors with `unsupported_platform` | Platform string is wrong | Confirm with user; valid: github_actions / azure_devops / gitlab_ci / jenkins |
| `invoke_skill` returns `denied_below_autonomy` | Skill autonomy below `propose` | Call `submit_for_approval` with the baseline + intended customizations |
| `confidence < 0.5` from customization | Stack or deploy targets were ambiguous | Ask user to clarify; rerun |
| Existing `cicd_pipeline` plan already filed for this project | Re-authoring an existing pipeline | Confirm with user; pass `changeNote: "Rewrite from baseline"` |
