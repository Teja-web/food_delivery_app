# Coznt Positioning

## Tagline

**AI-DLC Governed.**

Used as the headline on marketing surfaces. Treats AI-DLC as a compatibility claim ("Scrum-compliant", "DORA-aligned") — specific enough to be memorable, narrow enough to stay defensible as alternative methodologies emerge.

The marketing surface cites a specific methodology. The data model does not.

## Operating model: Govern. Verify. Trust.

The tagline is the category claim. The operating model is how coznt delivers on it.

```
Govern what AI can do.
Verify what AI produces.
Trust what can be proven.
```

| Pillar | Question it answers | Primary mechanism |
|---|---|---|
| **Govern** | Who is allowed to act, and how far? | Skill autonomy ladder (0–3, per project), policy rules, phase gates, approval routing |
| **Verify** | How do we know the output is correct? | Skill outcome ledger, deterministic CI/CD assessors, automated gate types (coverage, lint, security) |
| **Trust** | Can we explain, audit, and stand behind it? | Audit log, source-of-record linking on every UI claim, provenance, portfolio rollups |

The pillars are causally ordered: govern action → verify output → establish trust through evidence. Governance is the *mechanism*; trust through proven evidence is the *outcome*.

### Why this operating model, why now

Generating plausible code is cheap. **Establishing trust in it is the scarce resource.** Organizations that don't operationalize Govern–Verify–Trust accrue *verification debt* — unverified AI output that compounds risk until something fails in production. The full thesis, evidence, primitive mapping, and the proposed `verification_debt` score are in [verification-debt-thesis.md](verification-debt-thesis.md).

### Pillar relationship to existing claims

- "AI-DLC Governed" (tagline) = the **Govern** pillar surfaced for marketing.
- "Trust observable" (UX thesis) = the **Trust** pillar surfaced for users — every claim links to source of record.
- DX metrics (lead time, deploy frequency, CFR, MTTR) = byproducts of the **Verify** pillar's ledger.

Nothing is being replaced. The pillars are the spine that connects what was already there.

## Schema vocabulary: vendor-neutral

| Term | Why neutral |
|---|---|
| Project | Universal |
| Plan | Universal — covers Scrum Epic/Story, AI-DLC Unit, Shape Up Pitch |
| Phase Gate | Universal governance term |
| Approval | Universal |
| Skill / Skill Outcome / Skill Autonomy | Generic English; aligns with Anthropic/OpenAI agent vocabulary |
| Audit Log | Universal |
| Rule | Universal |
| Adapter | Universal connector term |
| Release | Universal |
| Choreography | Internal term for async task flows |
| Risk Register | Universal Agile/SAFe touchpoint, retained by AI-DLC |
| DORA metrics | Industry standard |

### Plan kinds

**Current** (`src/db/schema/plan-kinds.ts`): `epic`, `feature`, `story`, `adr`, `test_plan`, `release_plan`, `incident`, `storyboard`, `dev_summary`, `go_live_report`, `cicd_pipeline`

**Planned additions:**
- `spec` — cross-vendor convergent term (GitHub Workspace, OpenAI, Anthropic spec-driven)
- `risk_register` — universal touchpoint, explicitly retained by AI-DLC

### Terms never to introduce in schema

| Term | Why blocked |
|---|---|
| `bolt` | AWS / AI-DLC-specific |
| `unit` (as Plan kind) | AWS / AI-DLC-specific — `work_item` covers it |
| `prfaq` | Amazon-internal artefact form |
| `sprint` | Scrum-locked |
| `intent` (as schema noun) | AWS-tilted via AI-DLC; ambiguous with Cisco intent-based networking |

### Methodology overlays (display only)

Overlays change labels, not schema:

| Methodology | Overlay |
|---|---|
| AI-DLC | Phases shown grouped as Inception / Construction / Operations |
| Scrum | Plans labeled Epic / Story / Feature (already match) |
| SAFe | Plans labeled Portfolio Epic / Program Increment |
| Shape Up | Plans labeled Pitch / Bet / Cycle |

## Supported methodologies

One-line claim under the headline: *"Supports AI-DLC, Scrum, SAFe, Shape Up."*

## Stack position

Coznt overlays your SDLC sources of truth — it doesn't replace them. The peer set is Linear (work tracking), Vercel (deploy), Datadog/Grafana (observability), Cursor (AI authoring), GetDX (developer experience). The systems below remain the systems of record; coznt is the governance + observability layer on top.

| Layer | System of record | Coznt's role |
|---|---|---|
| Code | Git (GitHub / GitLab / Bitbucket / ADO Repos) | Webhook-graded; never pushes |
| Work items | Jira / ADO Boards / Linear / GitHub Issues | Mirrored in when bound; status writes routed back via adapter. Authored natively only when no tracker is bound (greenfield) |
| Docs | Confluence / Notion | ADR + spec publish-down, post-approval, server-side |
| CI/CD | GitHub Actions / ADO Pipelines | Pipeline read + scaffold; runs stay upstream |
| Deploy | Vercel / Render / Fly / k8s | Webhook-graded deploy outcomes drain to the ledger |

### vs. GetDX and DX measurement platforms

GetDX measures developer experience through self-report surveys and tracker-derived velocity. Coznt emits the same DX signal — lead time, deploy frequency, change-fail rate, MTTR — but **evidence-graded** from the same audit ledger that gates production merges. The metrics are the byproduct of governance, not a separate survey loop.

A GetDX customer who adopts coznt gets a control plane that uses the same signal to govern AI agents in the editor. The overlap is the metrics surface; the differentiator is what produced it.

### What coznt doesn't try to be

- Not a tracker — Jira / ADO / Linear own the work-item write path
- Not a Git host — GitHub / GitLab / Bitbucket own code
- Not a wiki — Confluence / Notion own long-form docs
- Not an authoring AI — Cursor / Copilot / Claude Code own the editor turn

The only thing coznt owns end-to-end is the governance overlay: phase gates, approvals, the skill autonomy ledger, audit, and the DX rollups that fall out of it.

## Vendor lens

| Buyer | Surface positioning | Why |
|---|---|---|
| AWS-aligned | "AI-DLC Governed" + Inception/Construction/Operations overlay | First-published AI-native methodology |
| Microsoft / GitHub-aligned | Highlight `spec` Plan kind, spec-driven framing | GitHub Workspace momentum |
| Google / DORA-aligned | Lead with DORA metrics | DORA is the universal language; we already emit it |
| Methodology-agnostic | "AI-native SDLC governance" | Neutral fallback |

## What does not change

- Phase enum: `requirements → design → development → testing → cicd → monitoring`
- Outcome sources: `pr_merge`, `pr_revert`, `pr_abandon`, `deploy_clean`, `deploy_incident` — "PR" is industry pidgin (GitHub + Bitbucket; GitLab MR is well-understood as the same concept)
- Audit log as the source of truth for every claim on screen
