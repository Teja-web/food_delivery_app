# DX Brief — MCP `/context` Endpoint + Cursor Onboarding

**References:** `docs/ux/DESIGN.md`, `docs/ux/moments.md` (Moment 6), `docs/ux/personas.md` (Devin).

## Why this brief is different

The other five briefs are **screen designs** — what Lovable should generate. This brief is **DX design** — API surface, response schema, latency budget, error-message wording, and a small companion modal that lives on H2 (project cockpit). The "design" here lives in the Cursor experience, not in the coznt web UI.

But the design decisions are no less consequential. If Devin's first MCP call returns slowly, returns the wrong project's context, or returns vague rule names with no source-of-record links, he disables the MCP and never opens coznt again. The two-planes thesis (Platform = control tower, Cursor = workspace) is won or lost on this surface.

This brief is the spec for the Cursor-side experience and the companion `Connect Cursor` modal that ships on the project cockpit (H2).

## Persona & primary action

- **User:** Devin (senior engineer, Cursor power-user, switches between 2-4 projects/week)
- **Primary action:** call `get_my_context` from Cursor and receive grounded, project-specific, sub-1-second context
- **Secondary:** be able to identify a *wrong-project* response instantly; debug a "no context found" with a clear error message; refresh after switching projects

## The MCP endpoint: `/api/v1/mcp/context`

### Request shape

```
POST /api/v1/mcp/context
Authorization: Bearer sk_coznt_live_...
Content-Type: application/json

{
  "repoUrl": "github.com/northwind/payments-api",   // optional, helps disambiguate
  "branch": "feature/PAY-1284-idempotency",          // optional
  "workItemKey": "PAY-1284"                          // optional
}
```

### Response shape

```json
{
  "project": {
    "id": "proj_pay",
    "name": "Internal Payments API",
    "slug": "internal-payments-api",
    "phase": "DEVELOPMENT",
    "url": "https://coznt.northwind.internal/projects/proj_pay"
  },
  "workItem": {
    "key": "PAY-1284",
    "title": "Implement idempotency keys on POST /captures",
    "url": "https://northwind.atlassian.net/browse/PAY-1284"
  },
  "rules": [
    {
      "id": "rule_iac",
      "title": "All payment-write endpoints require idempotency keys",
      "severity": "error",
      "phase": "DEVELOPMENT",
      "url": "https://coznt.northwind.internal/rules/rule_iac"
    }
  ],
  "skills": [
    {
      "slug": "frontend-test-author",
      "level": "MERGE",
      "autonomyDescription": "auto-approves <50 LOC + 80% coverage",
      "url": "https://coznt.northwind.internal/skills/skill_fta"
    }
  ],
  "adrs": [
    {
      "id": "adr_0011",
      "title": "Outbox pattern for payment webhooks",
      "url": "https://coznt.northwind.internal/plans/plan_pay_a1"
    }
  ],
  "meta": {
    "responseTimeMs": 318,
    "cacheStatus": "fresh",
    "computedAt": "2026-05-12T14:32:01Z"
  }
}
```

### Latency budget

| Tier | Cache state | Target | Hard limit |
|---|---|---|---|
| Best | warm | <200ms | 400ms |
| Normal | cache miss | <500ms | 1000ms |
| Worst | full recompute | <1000ms | 2000ms |

If the request exceeds the worst-case hard limit (2s), return whatever's cached with `"cacheStatus": "stale"` and `"meta.warning": "Computed from cache > 2 minutes old"` rather than blocking. Devin tolerates stale context far better than blocking context.

### Error responses

| Code | Meaning | Body |
|---|---|---|
| 401 | Invalid API key | `{ "error": "Invalid or expired API key. Visit https://coznt.northwind.internal/api-keys to create a new one." }` |
| 404 | No project bound to this key | `{ "error": "This API key isn't bound to any project. Bind it on the project cockpit: https://...", "fixUrl": "..." }` |
| 409 | Ambiguous project (multiple matches on repoUrl) | `{ "error": "Multiple projects match this repo. Specify the project explicitly.", "candidates": [...] }` |
| 429 | Rate limited | `{ "error": "Rate limit exceeded. Try again in {N}s.", "retryAfterSeconds": N }` |
| 503 | Backing service unavailable (e.g., Jira down) | `{ "error": "Coznt is up but Jira is unreachable. Returning partial context.", "partial": true, ...context... }` |

**Rule:** never return a bare `500`. Every error response includes a `fixUrl` or `retryAfterSeconds` or `candidates` payload — Devin needs to know how to recover without leaving Cursor.

## Wrong-project guard (most important UX decision)

The most damaging failure mode: coznt returns context for *the wrong project*, and Devin builds against it for 20 minutes before noticing. This must be impossible at a glance.

**Mitigation:** every response's first field is `project.name` and `project.slug`. The Cursor agent's system prompt (or the response itself) should make the project name the lead identifier in any UI it renders. If the project name doesn't match what Devin expects, the mismatch is instantly visible.

A second mitigation: when `repoUrl` is supplied and doesn't match the resolved project's bound repo, return `409` with the candidates — don't guess.

## Cursor-side rendering (what Devin actually sees)

Cursor's MCP tooling renders responses as text + citations. The response should be structured so a typical Cursor agent (Claude or GPT) renders it as:

> *"You're working on **Internal Payments API** (`internal-payments-api`), currently in the **DEVELOPMENT** phase. Your active work item is [PAY-1284 — Implement idempotency keys on POST /captures](https://northwind.atlassian.net/browse/PAY-1284). Rules in force: All payment-write endpoints require idempotency keys ([source](https://coznt.northwind.internal/rules/rule_iac), error severity). Skills available: frontend-test-author (Merge — auto-approves <50 LOC + 80% coverage), api-contract-checker (Merge — auto-approves schema-only changes), doc-updater (Lead — auto-approves docs-only changes). Relevant ADR: Outbox pattern for payment webhooks ([source](https://coznt.northwind.internal/plans/plan_pay_a1))."*

Every claim is linked back to coznt. Devin can click any citation and land on the source-of-record.

## Companion web surface: "Connect Cursor" modal (lives on H2)

This is a small modal triggered from the `[Connect Cursor]` button on the project cockpit (H2). It's *not* a hero, but it's high-leverage — it's the only screen Devin opens in coznt's web UI.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Connect Cursor to "Internal Payments API"            [✕]      │
│                                                                │
│ 1. Copy this snippet to your repo's .cursor/mcp.json:         │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ {                                                    │    │
│  │   "mcpServers": {                                    │    │
│  │     "coznt": {                                       │    │
│  │       "url": "https://coznt.northwind.internal/...", │    │
│  │       "env": {                                       │    │
│  │         "COZNT_API_KEY": "sk_coznt_live_4f8a2b9c..." │    │
│  │       }                                              │    │
│  │     }                                                │    │
│  │   }                                                  │    │
│  │ }                                                    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                              [Copy snippet]   │
│                                                                │
│ 2. Restart Cursor.                                             │
│                                                                │
│ 3. Ask Cursor: "What should I be working on?"                  │
│                                                                │
│ The API key above is project-specific. Keep it private —      │
│ rotate it from /api-keys if it leaks.                          │
│                                                                │
│                                  [Setup docs →]  [Done]       │
└────────────────────────────────────────────────────────────────┘
```

### Components

1. Modal (shadcn Dialog), 480px wide
2. Header: project name (so Devin knows which key he's about to copy)
3. Code block with the `mcp.json` snippet, pre-filled with the project-specific API key
4. "Copy snippet" button (success toast: "Copied to clipboard")
5. Three numbered steps in plain prose
6. Footer: link to setup docs (external) + Done button

### Interactions

- Click `[Copy snippet]` → copy to clipboard, toast confirms
- Click `[Setup docs →]` → opens external docs in new tab (don't block the modal)
- Click `[Done]` → close
- The API key is generated on-demand if no project-key exists yet; otherwise reuses the latest unrotated key

### States

- First-time: the modal generates a new project-scoped API key, shows it once, and the key is now visible only via `/api-keys` page (with rotation tools)
- Already connected: the modal shows the existing snippet + a "Regenerate API key" warning if Devin wants a fresh one (with confirmation: regenerating invalidates the old key)
- Org-level API key required (no project key allowed by org policy): the modal explains the policy and points to the org admin

## Anti-patterns

- ❌ Returning a bare 500 — every error must include a recovery path
- ❌ Returning a 200 with empty arrays for `rules` and `skills` — if there's no context, say so explicitly with `"empty": true, "reason": "..."`
- ❌ Returning context with no URLs in the citations (the grounding requirement)
- ❌ "Setup wizard" with 7 steps in the Connect Cursor modal — three steps is the spec
- ❌ Showing the API key in plaintext after the modal is dismissed (key is shown once, on the modal; subsequently only via `/api-keys` with rotation)
- ❌ Wrong-project context returned silently (must error to 409 with candidates)
- ❌ Caching beyond 5 minutes without a `stale` marker
- ❌ Loading spinner on Cursor side — sub-1s responses should render instantly; if slow, show a one-line "context loading…" inline

## Trust signals (load-bearing)

1. **Every claim links to a source.** Rules, skills, ADRs, work items — all have URLs. Devin can verify any single claim with a click.
2. **The project name leads every response.** Wrong-project mismatch is visible at a glance.
3. **Cache status is explicit.** `"cacheStatus": "fresh"` vs. `"stale"` is in every response so Devin (or the Cursor agent) can decide whether to refresh.
4. **Latency is reported.** `meta.responseTimeMs: 318` tells Devin the system is healthy. A 1500ms response is informational, not error.
5. **API key scope is clear.** Project-scoped keys exist; org-scoped keys exist; the modal names which is being used.

## What success looks like

Tuesday morning. Devin gets pulled onto `internal-payments-api` for the first time. He clones the repo, opens it in Cursor. The repo has a `.cursor/mcp.json` already committed by Sam (who used the Connect Cursor modal a week ago). Devin asks Cursor: *"What should I be working on?"*

Cursor responds in 320ms: project name, his Jira ticket, the rules in force, the skills he can invoke. Every citation is a link. He clicks one, lands on coznt's rule detail page, reads the rule, comes back to Cursor, writes the idempotency handler. The first 20 minutes of his orientation evaporated.

Three days later he switches to `auth-service-migration`. He asks the same question. Cursor returns the *correct* project (Auth Service Migration, not Payments API). The project name being first in the response makes it instantly clear. He writes the auth migration code. No copy-paste of context. No tab-switching to Confluence. The platform is invisible-but-load-bearing — exactly how the two-planes thesis demands.

## What this does NOT specify

- The Cursor system prompt that wraps the MCP response — that's a Cursor-side configuration question
- The exact MCP server library / Node package — engineering choice, the contract above is what matters
- The org-level vs. project-level API key policy — that's an admin-screen decision (see `/api-keys` functional brief, not in this scope)
- Rate-limit numbers — operational tuning, not UX
