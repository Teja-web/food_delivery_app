---
name: CI/CD Pipeline Authoring
description: Author a tailored CI/CD pipeline file by combining the generate_pipeline templater with project-specific customization
version: 1
tags: [platform, cicd, pipeline, devops, sdlc]
plan_kind: cicd_pipeline
---

# CI/CD Pipeline Authoring

The `generate_pipeline` MCP verb renders a baseline pipeline file (GitHub Actions, Azure DevOps, GitLab CI, Jenkins) from a small template library. This skill is the **authoring** layer on top: it inspects the project, picks the right template inputs, calls `generate_pipeline`, then customizes the output for this codebase's actual needs before filing the pipeline as a reviewable `cicd_pipeline` plan.

Use this skill when a project needs a pipeline that the template alone won't produce — extra test matrices, repo-specific secrets, deploy stages keyed to the project's environments, etc.

## When to Use

- A new project has no pipeline file checked in.
- An existing pipeline drifted and the team wants a clean baseline to diff against.
- A platform team is rolling out a new pipeline convention and wants per-project drafts to PR.

## Instructions

### Step 1 — Gather Context

```
invoke: get_my_context
invoke: get_design_context
invoke: get_plans { kind: "release_plan", status: "in_progress" }
invoke: get_plans { kind: "adr" }
```

What you're looking for:

- **Tech stack** — explicit in the project description, or implied by linked work items. Map to one of: `node`, `python`, `java`, `go`, `dotnet`.
- **Target platform** — the customer's existing CI provider. If unstated, ask. Do not default to GitHub Actions silently.
- **Deploy targets** — environments named in design context or release plans (staging / prod / preview / etc).
- **Container story** — Docker yes/no, K8s yes/no. Look in ADRs.

If any of (platform, stack) is missing after this step, ask the caller. Don't guess.

### Step 2 — Render the Baseline

Call the templater:

```
invoke: generate_pipeline {
  platform: "github_actions" | "azure_devops" | "gitlab_ci" | "jenkins",
  techStack: "node" | "python" | "java" | "go" | "dotnet",
  includeDocker: true | false,
  includeKubernetes: true | false
}
```

Returns `{ filename, content }`. The `content` is the templated YAML — usable as-is but generic. Treat it as the **starting point**, not the answer.

### Step 3 — Customize

Walk through the rendered content and adapt to this project:

- **Branch triggers** — replace generic `main` / `develop` with the project's actual branch names.
- **Test matrix** — pull from project's `package.json` / `pyproject.toml` / `pom.xml` if the caller can paste it. Match the actual versions in use.
- **Secrets** — list the env vars the pipeline expects, not just their existence. Reference the secret-manager (`GitHub Secrets`, `Azure Key Vault`, etc.) the customer uses.
- **Deploy stages** — add a stage per environment named in design context. Don't include stages for environments the project doesn't have.
- **Approval gates** — wire to coznt's `submit_phase_for_review` or to the platform's native gate (e.g., GitHub Environment protection rules). Per the project's conventions.
- **Coverage thresholds** — pull the project's enforced threshold from an ADR if one exists; otherwise leave commented with a TODO.

For each customization, leave an inline `# coznt: <reason>` comment so a human reviewer can see WHY each non-template change exists.

### Step 4 — File the Plan

The plan body holds the FULL pipeline YAML plus a short header explaining what's tailored vs templated. The agent that consumes this plan (or a human) checks it into the repo at `{filename}`.

```
invoke: upsert_plan {
  kind: "cicd_pipeline",
  slug: "cicd-{project-slug}-{platform}",
  title: "CI/CD Pipeline — {Project Name} ({platform})",
  summary: "{stack} on {platform}; {N} deploy stages; {Docker? K8s? coverage gate?}",
  body: "{markdown body with the YAML embedded — see below}",
  details: {
    platform: "...",
    stack: "...",
    filename: "...",
    rendered_with: "generate_pipeline@1",
    customizations: ["branch-triggers", "test-matrix", "deploy-stages", ...]
  },
  changeNote: "Drafted by cicd-pipeline-authoring from generate_pipeline baseline"
}
```

### Step 5 — Body Format

```markdown
# CI/CD Pipeline — {Project Name}

**Target platform:** {platform}
**Stack:** {stack}
**Container:** Docker {y/n}, Kubernetes {y/n}
**Filename in repo:** `{filename}`

## What's templated vs customized

Templated (from `generate_pipeline@1`):
- {bullet list — base stages from the template library}

Customized for this project:
- {bullet list — each non-template change, why it exists}

## Pre-merge checklist

- [ ] Required secrets exist in {secret manager name}: {list}
- [ ] Branch protection rules align with the pipeline's `on:` triggers
- [ ] Coverage threshold matches the team's stated bar
- [ ] Deploy stages reference real environments, not template placeholders
- [ ] On-call / alerting is wired for production deploys

## Pipeline file

\`\`\`yaml
{full YAML content here, with the `# coznt:` annotations preserved}
\`\`\`
```

## Quality Checklist

- [ ] No template placeholders left (e.g., `your-app-name`, `change-me`)
- [ ] Every secret the pipeline reads is named in the pre-merge checklist
- [ ] Every non-template change has a `# coznt:` comment explaining why
- [ ] Deploy stages correspond to real environments named in design context
- [ ] Coverage threshold is sourced from an ADR or explicitly TODO'd, never silently default
- [ ] `details.customizations` list matches the bullets in "Customized for this project"
