# GitHub App

*Purpose: one-time GitHub App registration so coznt's execution gate can post check-runs back to PRs.*

Coznt's execution gate needs a GitHub App so it can POST check-runs back to the PR. Without one, the gate still evaluates and writes verdicts to `gate_evaluations` — the merge UI just doesn't get the block signal. This doc is the one-time install.

## What the App needs

**Permissions (repository):**
- `pull_requests: read` — to read PR metadata and (later) the files list
- `checks: write` — to POST check-runs back to the PR
- `metadata: read` — automatic; required for any App

**Subscribe to events:**
- `pull_request` (opened, synchronize, reopened, edited, ready_for_review)
- Later: `deployment_protection_rule` for the deploy-gate phase
- Later: `check_suite` for re-runs

**Webhook URL:** `https://your-coznt.example.com/api/v1/webhooks/github`
**Webhook secret:** generate one and put it in `COZNT_GITHUB_WEBHOOK_SECRET` (signature verification is a follow-up; the route currently authenticates via the bearer-token API key flow).

## Registering the App

1. `https://github.com/settings/apps/new` — or your org's equivalent for an org-owned App.
2. Fill in the form. The App needs to be **installable on this account only** for development, then opened up later.
3. Generate a private key. Download it.
4. Note the **App ID** (top of the App settings page).

## Configuring coznt

Add to your `.env`:

```bash
COZNT_GITHUB_APP_ID=123456
COZNT_GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----"
COZNT_GITHUB_WEBHOOK_SECRET=<the webhook secret you set>
```

The literal `\n` in the private key is intentional — `src/lib/integrations/github-app.ts` un-escapes them so the key fits in one env var.

`isConfigured()` returns true when both `COZNT_GITHUB_APP_ID` and `COZNT_GITHUB_APP_PRIVATE_KEY` are set; check-runs will be POSTed automatically when the webhook handler runs.

## Installing the App on a repo

1. From the App's settings page, click **Install App**.
2. Pick the repo (or "All repositories" if you trust it).
3. Note the **installation ID** in the URL (`/installations/<id>`) — coznt resolves this from the webhook payload's `installation.id` block at runtime, so you don't have to store it explicitly.

## Wiring the adapter binding

Once installed, the webhook delivers events to coznt with `repository.full_name = "owner/repo"`. The `/integrations` page is where you create the adapter binding so coznt can resolve `(org, github, github.com/owner/repo) → projectId`. Without that binding, webhook events come in but get marked `processedAt` with a `no project binding for {externalKey}` error.

## Verifying end-to-end

1. Open a test PR in the bound repo with a `Made-by: my-skill-slug` trailer in any commit.
2. Within seconds, you should see:
   - A new row in `gate_evaluations` (visible via `/audit` filtered to `scope=skills`)
   - A check named **coznt / autonomy gate** on the PR, conclusion matching the skill's autonomy × change-risk
3. Demote the skill (e.g. record an incident outcome). The next call to `recomputeSkillAutonomy` for that skill re-evaluates open PRs and flips the check-run to `failure`.

## What if you don't install the App

The gate still works as a **read-only ledger**:
- Every webhook still produces a `gate_evaluations` row
- The `/skills/[id]` "blocked PRs" surface still counts correctly
- `/audit` still records `execution_gate.success` / `execution_gate.failure` rows

You just don't get the actual GitHub merge block until the App is installed. The data model is identical; flipping the env vars on lights up the enforcement piece without re-running anything.
