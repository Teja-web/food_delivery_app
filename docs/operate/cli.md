# `coznt` CLI

*Purpose: command and flag reference for the developer-side `coznt` CLI (`connect`, `sync`).*

The `coznt` CLI is the developer-side companion to the coznt server. It writes the wiring your AI editor needs (MCP config) and pulls workflow choreographies into your repo so they show up natively in Cursor, Claude Code, Cline, Continue, or Zed.

> **Slogan:** push the choreography, keep the daemon.

Two subcommands ship today:

- `coznt connect` — one-shot bootstrap: detect editor, write MCP config, prompt for API key, run an initial sync
- `coznt sync` — pull the bound project's choreographies into `<repo>/.coznt/skills/`

## Install

The CLI is distributed via the same private artifact stream as the coznt MCP server. Once the coznt deployment is reachable, install it as part of the customer's standard developer onboarding. During development, run from source:

```bash
pnpm cli <subcommand> [flags]
# e.g.
pnpm cli sync --dry-run
```

Once installed globally, the binary is `coznt`:

```bash
coznt connect --project=my-app
coznt sync
```

## `coznt connect`

One-shot bootstrap. Detects which AI editor is in the repo, writes the editor's MCP config (merging into existing `mcpServers` / `context_servers` entries), prompts for an API key, stores it in the OS keychain (or env-var indirection), runs an initial `coznt sync`, and ensures `.coznt/.local/` is gitignored.

```bash
coznt connect                            # full prompts
coznt connect --project=my-app           # skip the project picker
coznt connect --editor=cursor            # skip editor detection
coznt connect --api-key-env=COZNT_KEY    # use env-var indirection instead of keychain
coznt connect --server=https://coznt.example.com
coznt connect --mcp-launcher=coznt-mcp   # bring your own MCP launcher command
```

### Flags

| Flag | Purpose |
|---|---|
| `--editor=<claude-code\|cursor\|cline\|zed\|continue>` | Skip detection; configure this editor |
| `--project=<id\|slug\|name>` | Match a project without prompting |
| `--server=<url>` | Coznt server URL; default `http://localhost:3029` |
| `--api-key-env=<NAME>` | Use env-var indirection; default is OS keychain |
| `--mcp-launcher=<cmd>` | Override the launcher command written into the editor's MCP config |

### What gets written

- `.coznt/config.json` — connection metadata (server URL, project ID, `apiKeyRef`)
- `.coznt/README.md` — one-page explainer for teammates who see the directory in `git pull`
- `.coznt/.local/` added to `.gitignore` (if missing)
- The editor's MCP config (see below) — merged, not overwritten
- The initial choreography bundle, via `coznt sync`

### Editor config paths

| Editor | Path |
|---|---|
| Claude Code | `.claude/mcp.json` |
| Cursor | `.cursor/mcp.json` |
| Cline | `.cline/mcp.json` |
| Zed | `.zed/settings.json` (under `context_servers`) |
| Continue | `.continue/mcp.json` |

### Existing entries

Connect never overwrites unrelated `mcpServers` / `context_servers` entries. A prior `coznt` entry is replaced after a warning. Other servers are preserved verbatim.

## Configuration

Each repo has a `.coznt/config.json`:

```json
{
  "serverUrl": "https://coznt.example.com",
  "projectId": "proj_abc123",
  "apiKeyRef": { "kind": "env", "name": "COZNT_API_KEY" }
}
```

| Field | Required | Description |
|---|---|---|
| `serverUrl` | yes | Base URL of the coznt deployment. Trailing slash stripped. |
| `projectId` | yes | The project this repo is bound to. |
| `apiKeyRef` | yes | Where to find the API key. Either `{ kind: "env", name: "ENV_VAR_NAME" }` or `{ kind: "keychain", account: "coznt:<projectId>" }`. **Never plaintext.** |

The plaintext API key is never stored in `.coznt/config.json`. It lives in the env var named by `apiKeyRef.name`, or in the OS keychain under the account named by `apiKeyRef.account`.

## `coznt sync`

Aligns your repo's `.coznt/skills/` with what coznt is currently serving for the bound project.

```bash
coznt sync              # interactive — prompts on conflicts
coznt sync --force      # overwrite local edits without prompting
coznt sync --dry-run    # print planned actions, write nothing
```

### How it classifies entries

For each choreography in the manifest, `sync` compares three values: the **remote hash** (from the server's manifest), the **lock hash** (from `<repo>/.coznt/skills/<slug>/.lock`), and the **local file hash** (from `<repo>/.coznt/skills/<slug>/SKILL.md`).

| Local file | Lock file | Remote vs lock | Classification | Action |
|---|---|---|---|---|
| absent | absent | new | **new** | fetch + write |
| matches lock | matches local | matches | **unchanged** | skip |
| matches lock | exists | differs | **remote-only** | fetch + overwrite (safe) |
| differs from lock | exists | matches | **locally-edited** | skip (respects local edits) |
| differs from lock | exists | differs | **conflict** | prompt (or `--force`) |
| exists | absent | — | **conflict** | prompt (lock missing) |

### Drift handling

When a conflict is detected and `--force` is not set, `coznt sync` prompts:

```
release-notes-generator: local edits AND remote changes both diverge from lock. (overwrite/keep/diff)?
```

- **overwrite** — fetch and replace local file + lock with remote
- **keep** — leave local file alone; do not update lock
- **diff** — print the local file (first 30 lines) and re-prompt overwrite/keep

### Hash verification

Every fetched choreography body is re-hashed locally before being written. If the computed hash doesn't match the manifest hash for that slug, `coznt sync` aborts with exit code 1 and no files are written.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (or `--dry-run` completed cleanly) |
| 1 | Error: config missing, network failure, hash mismatch, etc. |

## Security notes

- **API key never logged.** Error messages reference the `apiKeyRef` (env var name or keychain account), never the plaintext value.
- **`.coznt/skills/` is committed by design.** Workflow guides propagate to teammates on `git pull`. To exclude a single skill, edit it locally — `sync` will respect your edit and not overwrite (until you reconcile the conflict).
- **`.coznt/.local/` is gitignored** (added by `coznt connect`). Use it for any per-developer state.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `.coznt/config.json not found` | Repo not connected | Run `coznt connect` (or hand-author `.coznt/config.json`) |
| `API key env var 'X' is not set` | `apiKeyRef.kind=env` but the env var is empty | `export X=...` then retry |
| `Hash mismatch on <slug>` | Network corruption or server misconfiguration | Retry; if persistent, contact your coznt admin |
| `API key is bound to a different project` | API key is project-scoped to a different project than `config.projectId` | Issue a new key for this project from `/api-keys` |

---

## See it work

Below is a real terminal walkthrough — the kind a new developer would see on their first pass through coznt's daemon-and-choreography flow.

### First-time bootstrap on a fresh repo

```
$ cd ~/code/payments-service
$ ls -la .coznt
ls: .coznt: No such file or directory

$ coznt connect
coznt connect — server https://coznt.acme.internal
✓ Detected Claude Code (.claude/)
? Project: payments-service
✓ Project: Payments Service (payments-service, proj_4f2c1)
? API key: ********************
✓ Stored API key in OS keychain (account: coznt:proj_4f2c1)
✓ Wrote .coznt/config.json
✓ Added .coznt/.local/ to .gitignore
✓ Wrote .claude/mcp.json (new)

Running initial sync …
coznt sync — project proj_4f2c1 @ https://coznt.acme.internal
Manifest: 12 choreographies, manifestHash=4f8a2b1c9d3e…
Comparing locks: 12 new, 0 unchanged, 0 updated remote, 0 local-only edits, 0 conflicts
Fetched 12 entries; verifying hashes…
  [write] .coznt/skills/adr-extractor/SKILL.md (v1.0.0)
  [write] .coznt/skills/cicd-pipeline-authoring/SKILL.md (v1.0.0)
  [write] .coznt/skills/dev-summary-generator/SKILL.md (v1.0.0)
  [write] .coznt/skills/epic-decomposer/SKILL.md (v1.0.0)
  [write] .coznt/skills/feature-spec-generator/SKILL.md (v1.0.0)
  [write] .coznt/skills/go-live-report-generator/SKILL.md (v1.0.0)
  [write] .coznt/skills/incident-postmortem/SKILL.md (v1.0.0)
  [write] .coznt/skills/release-notes-generator/SKILL.md (v1.0.0)
  [write] .coznt/skills/requirements-document/SKILL.md (v1.0.0)
  [write] .coznt/skills/storyboard-generator/SKILL.md (v1.0.0)
  [write] .coznt/skills/test-execution-report-generator/SKILL.md (v1.0.0)
  [write] .coznt/skills/test-plan-generator/SKILL.md (v1.0.0)

Sync complete: 12 written, 0 skipped, 0 already current.

Connected. Restart Claude Code to load the MCP server.
```

After restarting Claude Code, the 12 skills appear in the skill picker. Each one is invokable by description — typing "draft release notes" or "what shipped" triggers `release-notes-generator`; "postmortem" or "RCA" triggers `incident-postmortem`.

### A normal sync (no remote changes)

```
$ coznt sync
coznt sync — project proj_4f2c1 @ https://coznt.acme.internal
Manifest: 12 choreographies, manifestHash=4f8a2b1c9d3e…
Comparing locks: 0 new, 12 unchanged, 0 updated remote, 0 local-only edits, 0 conflicts
Nothing to do — every choreography is in sync.
```

### A sync that finds an upstream version bump

```
$ coznt sync
coznt sync — project proj_4f2c1 @ https://coznt.acme.internal
Manifest: 12 choreographies, manifestHash=8b1e4c9a2f5d…
Comparing locks: 0 new, 10 unchanged, 2 updated remote, 0 local-only edits, 0 conflicts
Fetched 2 entries; verifying hashes…
  [write] .coznt/skills/test-plan-generator/SKILL.md (v1.1.0)
  [write] .coznt/skills/release-notes-generator/SKILL.md (v1.0.1)

Sync complete: 2 written, 0 skipped, 10 already current.
```

The `.lock` diff in the next PR shows exactly which choreographies moved and to what version — reviewers see "release-notes-generator v1.0.0 → v1.0.1" without reading the body.

### A sync where a teammate's local edit is respected

```
$ coznt sync
coznt sync — project proj_4f2c1 @ https://coznt.acme.internal
Manifest: 12 choreographies, manifestHash=2a4f8c1e9b3d…
Comparing locks: 0 new, 11 unchanged, 0 updated remote, 1 local-only edits, 0 conflicts
  [skip] release-notes-generator: local edits present, remote unchanged. Leaving as-is.

Sync complete: 0 written, 1 skipped, 11 already current.
```

If the upstream later changes too, `sync` flips that entry to a conflict and prompts overwrite / keep / diff. Use `--force` to skip the prompt in CI.

### Dry-run before a teammate's PR review

```
$ coznt sync --dry-run
coznt sync — project proj_4f2c1 @ https://coznt.acme.internal
Manifest: 12 choreographies, manifestHash=8b1e4c9a2f5d…
Comparing locks: 0 new, 10 unchanged, 2 updated remote, 0 local-only edits, 0 conflicts
[dry-run] Would fetch: test-plan-generator, release-notes-generator
[dry-run] Would skip:  (none)
```

Useful in CI: a `coznt sync --dry-run` step that fails the build when local choreographies have drifted from the server keeps the repo honest without doing destructive writes.
