# Coznt Personas

**Wedge:** Small enterprise teams (5-25 people) running multiple internal projects, inside an enterprise context (audit pressure, multi-system integration, governance). Cross-domain — fintech, healthcare, gov, retail, manufacturing, insurance all qualify.

Four personas in v1. Three primary daily users (Sam, Devin, Jordan) and one weekly stakeholder (Priya). One v2 persona (Marcus) noted for forward design intent but not built for now.

Each persona is named with a job-defining consequence. Categories like "engineering leader" or "developer" don't earn a place here.

---

## Primary

### Sam — Team Lead / Player-Coach (Primary daily user)

- **Role:** Leads a 5-15 person engineering team. Often still coding himself part-time. Owns 2-4 active internal projects in flight at any time.
- **Org shape:** Could be inside a Fortune 500 platform group, a mid-market enterprise, a digital factory squad at an insurer, an innovation lab at a bank, or a 20-person AI-native enterprise running internal apps. The constant is: small team, multiple projects, enterprise governance pressure.
- **Paid to do:** Ship the team's roadmap across all 2-4 projects. Unblock the team. Report status up. Run the release cadence on each project without dropping the others.
- **Day-to-day in coznt:** Daily, often multiple times. Lives in `/projects` (his portfolio view), `/approvals` (his inbox across all projects), and individual project cockpits when a gate is up. The cross-project view is his home page.
- **Job-defining moment:** It's Friday. His skip-level asks "where are we on all four of your projects?" Today this is a four-hour reconciliation across Jira, GitHub, Slack, and four different team conventions. With coznt, it's a single screen — the portfolio view answers it.
- **Why he keeps using coznt:** It's the only place that gives him cross-project visibility *and* per-project depth. The phase-gate cadence replaces his status-meeting tax across all his projects.
- **Deal-breaker:** If coznt becomes another place he has to update status manually. Data must be pulled from systems of record (GitHub/Jira/ADO), not double-entered. If skill autonomy doesn't earn auto-approvals on his low-risk changes, the governance friction outweighs the benefit.

### Devin — Senior Engineer (Builder)

- **Role:** One of Sam's engineers. Multi-project — works on whichever of the team's projects has the highest-priority work this week.
- **Day-to-day in coznt:** He doesn't open the web UI most days. He lives in **an MCP-capable IDE** — Cursor or Claude Code today, equally Cline, Continue, Zed, or whatever ships with MCP support tomorrow. Coznt is the MCP server his agent mounts, giving it his current project, current phase, phase discipline (allowed/forbidden), rules in force, skills he can call (with autonomy levels), and the boilerplate context he stopped having to retype.
- **Job-defining moment:** He switches from Project A to Project B mid-week. He asks his agent "what should I be working on?" The answer is grounded — the right project, the right phase, the right ADRs, the right rules, the right skills. He doesn't have to remember which Confluence page applies to which project.
- **Why he keeps using coznt:** It removes 30 minutes/day of context-loading boilerplate, *especially* when he's juggling multiple projects. Net positive even if he never reads the web UI. The MCP server is client-agnostic, so a team-mate adopting Claude Code or Cline gets the same coznt experience without coznt needing to change.
- **Deal-breaker:** Latency. If `get_my_context` takes >2s, Devin disables the MCP. Wrong-project context is even worse than slow context — if the agent gives him Project B's rules while he's working on Project A, that's a trust break that's hard to recover from.

### Jordan — DevOps / SRE / Platform Engineer (Integrator, shared)

- **Role:** Sits in a horizontal Platform team that serves Sam's team and several others. Owns the integration surface between internal tools (GitHub Enterprise, Jira, Azure DevOps, Confluence, Datadog, PagerDuty).
- **Day-to-day in coznt:** Weekly to a few times a week. Lives in `/integrations` (where adapter bindings get configured — once per project per provider), the cross-project DORA view, and `incident` plans when something breaks.
- **Job-defining moment:** A deployment goes bad on one of the seven projects he supports. MTTR clock starts. He needs to know what changed on *that* project, which gate let it through, which skill (if any) auto-merged it, and whether the same skill ran clean on the other six projects. The autonomy ledger + signed action log + cross-project comparison is the post-mortem.
- **Why he keeps using coznt:** Adapter bindings live in one place across all projects he supports, not scattered across 7 squad-owned configs. DORA is computed for him at both per-project and cross-project granularity.
- **Deal-breaker:** If coznt's webhook ingestion can't keep up with deployment volume across all the projects he supports, or if adapter bindings are flaky on any one of them, Jordan rips it out.

---

## Weekly stakeholder (primary buyer, less primary user)

### Priya — Director of Engineering / Platform Engineering (Buyer)

- **Role:** Sits 1-2 layers above Sam. Has 4-8 teams reporting up through her, each like Sam's team. Total span: 30-100 engineers across 12-30 internal projects.
- **Paid to do:** Keep portfolio-wide lead time down, change-failure rate flat, every audit pass on first try. Make AI-assisted engineering safe enough that legal and security stop asking nervous questions.
- **Day-to-day in coznt:** Weekly, not daily. Checks the cross-team / cross-project autonomy ledger trend, scans portfolio-wide DORA, audits which skills earned promotion or got demoted this week. Drills into individual teams only when she sees a regression.
- **Job-defining moment:** Her CISO asks "show me every change an AI agent made to any of our internal payments-adjacent projects in the last 90 days, and the human who reviewed each one." She has 24 hours. Without coznt, this is an archaeology dig across her 12-30 projects' Git histories, Cursor logs, and Slack. With coznt, it's a query that spans all projects.
- **Why she keeps using coznt:** It is the only system that answers the CISO's question without manual reconciliation across N projects. Removing it means writing 30 different runbooks.
- **Deal-breaker:** False sense of safety. If the autonomy ledger says a skill is "senior" across her portfolio but it then ships a prod incident on one team, Priya loses trust in the whole system. Trust must be earned visibly *and accurately, cross-project*.

---

## v2 — design for, don't build now

### Marcus — Compliance / Audit Manager (Evidence consumer)

- **Role:** Reports to General Counsel, not Engineering. Runs the org's audit-evidence cycle (SOC2, ISO, HIPAA, FedRAMP, PCI — depending on the customer's domain).
- **Why v2:** His surface is a tamper-evident export + audit log endpoint, not a daily UI. Punting him means we don't claim audit-grade in v1. Designing with him in mind means we **don't make decisions in v1 that block his v2 surface** (e.g., we keep `audit_log` writes immutable, we don't garbage-collect skill_outcomes, we use stable IDs).
- **Forward design intent:** Every action taken in coznt (approval, gate transition, skill invocation, autonomy level change) must be reconstructable from the database alone in v2. v1 must not destroy that information.

---

## Anti-personas (chose NOT to design for)

- **C-suite / executive viewer.** Doesn't log into coznt. Consumes reports Priya hands them. Designing "for the CTO" usually means designing for nobody.
- **External auditor.** Auditors don't log into coznt. They consume Marcus's exports (v2).
- **End user of the apps being built.** Coznt is for the team that builds internal apps, not the people who use them.
- **Solo founder / pre-governance team.** Wrong stage — no audit pressure, no multi-system integration burden. Not our market.
- **1000+ engineer Big Tech org.** They build their own platform tooling. Not our market.
- **Open source / hobbyist developer.** Same. Not our market.
- **Pure consumer-product startup.** Their projects are external products, not internal. Different shape.

---

## Persona-to-surface map (for sanity)

| Surface | Sam | Devin | Jordan | Priya |
|---|:-:|:-:|:-:|:-:|
| `/projects` portfolio view | **★** | | ✓ | ✓ |
| `/projects/[id]` cockpit | **★** | | ✓ | |
| `/plans` & detail | ✓ | | ✓ | |
| `/approvals` inbox | **★** | | | ✓ |
| `/skills` autonomy ledger (cross-project) | ✓ | | ✓ | **★** |
| `/skills/[id]` autonomy detail | ✓ | | ✓ | **★** |
| `/rules` | ✓ | | ✓ | |
| `/integrations` | ✓ | | **★** | |
| `/metrics` DORA (per-project + cross-project) | ✓ | | **★** | **★** |
| Cursor / Claude MCP surface | | **★** | | |

`★` = primary user of this surface. The hero-screen list emerges from the stars:

1. **`/projects` portfolio view** — Sam's home page. Currently a flat table; needs to become a portfolio cockpit.
2. **`/projects/[id]` cockpit** — Sam's per-project deep view. Currently read-only; needs per-phase guidance + cadence affordances.
3. **`/approvals` inbox** — Sam's daily inbox. Currently a list with no approve/reject; needs the action surface.
4. **`/skills` autonomy ledger** — Priya's weekly check-in. Currently just a list; needs the trust-earned visualization.
5. **`/integrations` wizard** — Jordan's setup flow. Currently read-only stubs; needs the binding wizard.
6. **`/metrics` DORA** — Priya + Jordan's measurement surface. Currently per-project only; needs cross-project rollup.
7. **MCP server** — Devin's invisible surface. Lives outside the web UI but has UX implications (latency, correctness, error messages). Coznt ships a single MCP server (`@coznt/mcp`) speaking the open protocol; any compliant client (Cursor, Claude Code, Cline, Continue, Zed, …) mounts it identically.

---

## Open questions to revisit at moments-stage

1. **Cross-project surfaces are the differentiator** — they're the structural advantage. Yet most of coznt's current UI is per-project. The biggest leverage in the UX pass is to make the cross-project views first-class (Sam's portfolio, Priya's cross-skill view, Jordan's cross-project DORA).
2. **MCP onboarding** is a real UX problem even though Devin lives in his IDE — the setup flow (whatever the client's `mcp.json` equivalent is — `.cursor/mcp.json`, `.claude/mcp.json`, Cline's settings, etc.) plus the `get_my_context` first-call experience determine whether he ever uses coznt at all. Ship at least three working client configs out of the box.
3. **Sam's role as player-coach** means his project cockpit must work for him as a *contributor* too (not just as a manager view). He's reviewing PRs and approving gates from the same screen.
