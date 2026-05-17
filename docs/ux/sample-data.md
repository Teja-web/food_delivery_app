# Coznt Sample Data Fixture

Domain-neutral but real-feeling. Cross-domain wedge — the same fixture must be believable for a fintech, healthcare, retail, gov, or manufacturing reader. Names are deliberately boring and infrastructure-shaped.

Every brief in `docs/ux/briefs/` pulls from this fixture. Don't invent new names inside briefs — extend this file and reference it instead.

## The reference org

- **Org name:** Northwind Platform Engineering
- **Org size:** 8 engineers, 1 SRE shared (Jordan), 1 director (Priya, 1 layer up)
- **Tenure:** 18 months on the platform; coznt adopted 4 months ago
- **Active internal projects:** 4

## People

| Name | Role | Persona | Notes |
|---|---|---|---|
| Sam Okafor | Tech Lead | Sam | Player-coach. Leads the team. Owns all 4 projects. |
| Devin Reyes | Senior Engineer | Devin | Multi-project. Cursor power-user. |
| Aisha Patel | Senior Engineer | (Devin-shaped) | Owns most schema work |
| Marco Bianchi | Mid Engineer | (Devin-shaped) | Auth-service migration lead |
| Yuki Tanaka | Mid Engineer | (Devin-shaped) | Data warehouse work |
| Rohan Desai | Mid Engineer | (Devin-shaped) | Reviewer-of-record on ADRs |
| Lena Volkov | Junior Engineer | (Devin-shaped) | New joiner, 8 weeks in |
| Tomás Ruiz | Junior Engineer | (Devin-shaped) | Pairing with Lena |
| Jordan Mwangi | SRE / Platform | Jordan | Shared across 3 teams |
| Priya Iyer | Director of Engineering | Priya | 1 layer above Sam |

User-account avatars: monogrammed initials, no photos in sample data.

## Projects (4 active)

```json
[
  {
    "id": "proj_pay",
    "slug": "internal-payments-api",
    "name": "Internal Payments API",
    "phase": "DEVELOPMENT",
    "status": "IN_PROGRESS",
    "createdAt": "2026-01-14",
    "lastDeployAt": "2026-05-09T14:22:00Z",
    "leadTime30d": 3.4,
    "deployFreq30d": 6.2,
    "changeFailure30d": 0.08,
    "mttr30d": 1.8,
    "openApprovals": 3,
    "autonomyEvents7d": 1,
    "owner": "Sam Okafor",
    "githubRepo": "northwind/payments-api",
    "jiraProject": "PAY"
  },
  {
    "id": "proj_dw",
    "slug": "data-warehouse-v2",
    "name": "Data Warehouse v2",
    "phase": "DESIGN",
    "status": "IN_PROGRESS",
    "createdAt": "2026-03-02",
    "lastDeployAt": null,
    "leadTime30d": null,
    "deployFreq30d": 0,
    "changeFailure30d": null,
    "mttr30d": null,
    "openApprovals": 5,
    "autonomyEvents7d": 0,
    "owner": "Sam Okafor",
    "githubRepo": "northwind/dw-v2",
    "jiraProject": "DW"
  },
  {
    "id": "proj_auth",
    "slug": "auth-service-migration",
    "name": "Auth Service Migration",
    "phase": "TESTING",
    "status": "BLOCKED",
    "createdAt": "2025-11-21",
    "lastDeployAt": "2026-05-10T09:13:00Z",
    "leadTime30d": 5.7,
    "deployFreq30d": 4.8,
    "changeFailure30d": 0.18,
    "mttr30d": 4.2,
    "openApprovals": 2,
    "autonomyEvents7d": 2,
    "owner": "Sam Okafor",
    "githubRepo": "northwind/auth",
    "jiraProject": "AUTH",
    "regressionNote": "CFR regressed 8% → 18% over 14d. 3 auto-merges by schema-migration-reviewer suspected."
  },
  {
    "id": "proj_kafka",
    "slug": "kafka-pipeline-modernization",
    "name": "Kafka Pipeline Modernization",
    "phase": "REQUIREMENTS",
    "status": "IN_PROGRESS",
    "createdAt": "2026-04-22",
    "lastDeployAt": null,
    "leadTime30d": null,
    "deployFreq30d": 0,
    "changeFailure30d": null,
    "mttr30d": null,
    "openApprovals": 2,
    "autonomyEvents7d": 0,
    "owner": "Sam Okafor",
    "githubRepo": null,
    "jiraProject": "KAF"
  }
]
```

The four shapes deliberately span the phase lifecycle: Requirements (kafka, new), Design (dw-v2, mid-flight), Development (payments-api, active), Testing (auth, **blocked with the cross-project DORA regression** — this is the live demo of moment 5).

## Skills (5)

```json
[
  {
    "id": "skill_fta",
    "slug": "frontend-test-author",
    "name": "Frontend Test Author",
    "level": "SENIOR",
    "levelSetAt": "2026-04-18",
    "lastReviewedAt": "2026-05-05",
    "nextReviewAt": "2026-06-04",
    "stats30d": { "success": 47, "rolledBack": 2, "incident": 0 },
    "projects": ["proj_pay", "proj_auth"],
    "enabled": true
  },
  {
    "id": "skill_smr",
    "slug": "schema-migration-reviewer",
    "name": "Schema Migration Reviewer",
    "level": "JUNIOR",
    "levelSetAt": "2026-05-10",
    "lastReviewedAt": "2026-05-10",
    "nextReviewAt": "2026-06-10",
    "stats30d": { "success": 18, "rolledBack": 4, "incident": 1 },
    "projects": ["proj_auth", "proj_dw"],
    "enabled": true,
    "demotionNote": "Demoted Senior → Junior on 2026-05-10 after change-failure correlation on auth-service-migration"
  },
  {
    "id": "skill_acc",
    "slug": "api-contract-checker",
    "name": "API Contract Checker",
    "level": "SENIOR",
    "levelSetAt": "2026-02-04",
    "lastReviewedAt": "2026-05-01",
    "nextReviewAt": "2026-05-31",
    "stats30d": { "success": 92, "rolledBack": 1, "incident": 0 },
    "projects": ["proj_pay", "proj_dw", "proj_kafka"],
    "enabled": true
  },
  {
    "id": "skill_du",
    "slug": "doc-updater",
    "name": "Doc Updater",
    "level": "PRINCIPAL",
    "levelSetAt": "2026-03-22",
    "lastReviewedAt": "2026-05-08",
    "nextReviewAt": "2026-07-08",
    "stats30d": { "success": 156, "rolledBack": 0, "incident": 0 },
    "projects": ["proj_pay", "proj_dw", "proj_auth", "proj_kafka"],
    "enabled": true,
    "promotionEvent": {
      "from": "SENIOR",
      "to": "PRINCIPAL",
      "at": "2026-05-09",
      "reason": "30-day clean run across 4 projects"
    }
  },
  {
    "id": "skill_ssr",
    "slug": "security-scan-runner",
    "name": "Security Scan Runner",
    "level": "INTERN",
    "levelSetAt": "2026-04-30",
    "lastReviewedAt": "2026-05-12",
    "nextReviewAt": "2026-05-19",
    "stats30d": { "success": 12, "rolledBack": 8, "incident": 0 },
    "projects": ["proj_pay", "proj_auth"],
    "enabled": true,
    "pendingReview": {
      "thresholdReached": false,
      "blockingReason": "Rollback rate 40% — must drop below 15% to be promotable"
    }
  }
]
```

**Live storyline in the fixture:**
- `doc-updater` was just promoted to Principal on 2026-05-09 → the celebratory moment on `/skills` (Moment 4)
- `schema-migration-reviewer` was just demoted Senior → Junior on 2026-05-10 → the negative trust signal, ALSO the source of the DORA regression on `auth-service-migration` (Moment 5)
- These two events on adjacent days make the demo telling a real story

## Plans (12)

| ID | Project | Kind | Title | Status |
|---|---|---|---|---|
| plan_pay_r1 | proj_pay | requirement | Idempotent retry for failed payment captures | APPROVED |
| plan_pay_a1 | proj_pay | adr | Outbox pattern for payment webhooks | APPROVED |
| plan_pay_f1 | proj_pay | feature_plan | Implement idempotency keys on POST /captures | IN_PROGRESS |
| plan_pay_t1 | proj_pay | test_plan | Contract tests for v2.4 payment surface | DRAFT |
| plan_pay_rel1 | proj_pay | release_plan | Q3 payments-API v2.4 rollout | PENDING_APPROVAL |
| plan_dw_r1 | proj_dw | requirement | Sub-hour data freshness for analytics dashboards | APPROVED |
| plan_dw_a1 | proj_dw | adr | Postgres logical decoding over Debezium for CDC | PENDING_APPROVAL |
| plan_dw_a2 | proj_dw | adr | Iceberg vs Delta Lake — storage layer | PENDING_APPROVAL |
| plan_auth_f1 | proj_auth | feature_plan | Migrate /auth/login from Devise to Better-Auth | IN_PROGRESS |
| plan_auth_t1 | proj_auth | test_plan | End-to-end auth migration smoke tests | IN_PROGRESS |
| plan_auth_i1 | proj_auth | incident | Migration rollback on 2026-05-08 — session cookie mismatch | RESOLVED |
| plan_kafka_r1 | proj_kafka | requirement | Replace v1 consumer lag monitoring with continuous sampling | DRAFT |

## Approvals (12 pending — Sam's inbox)

| ID | Project | Entity | Title | Requested by | Skill | Age | Status |
|---|---|---|---|---|---|---|---|
| appr_001 | proj_pay | plan | release_plan Q3 v2.4 rollout | Devin R. | — | 2h | PENDING |
| appr_002 | proj_pay | phase_gate | Dev → Testing gate | system | — | 5h | PENDING |
| appr_003 | proj_pay | work_item | PR #1284 idempotency-keys | bot | api-contract-checker (Senior) | 1d | PENDING (auto-approval eligible) |
| appr_004 | proj_dw | plan | ADR-0014 logical decoding | Yuki T. | — | 3d | PENDING |
| appr_005 | proj_dw | plan | ADR-0015 Iceberg vs Delta | Yuki T. | — | 3d | PENDING |
| appr_006 | proj_dw | phase_gate | Design → Dev gate | system | — | 2d | PENDING (4 unmet criteria) |
| appr_007 | proj_dw | work_item | PR #93 schema-init | bot | schema-migration-reviewer (Junior) | 4h | PENDING (manual review required — demoted skill) |
| appr_008 | proj_auth | release | hotfix rollback session-cookie | Marco B. | — | 9d | PENDING (stale) |
| appr_009 | proj_auth | work_item | PR #441 session-cookie-fix | bot | frontend-test-author (Senior) | 6h | PENDING |
| appr_010 | proj_kafka | plan | requirement consumer lag sampling | Rohan D. | — | 1d | PENDING |
| appr_011 | proj_kafka | plan | adr-stream-processor-choice | Rohan D. | — | 1d | PENDING |
| appr_012 | proj_pay | work_item | PR #1290 docs-updater output | bot | doc-updater (Principal) | 30m | PENDING (auto-approval eligible — Principal autonomy) |

**Storyline:** 3 of the 12 are auto-approval-eligible (Sam can bulk-clear). 1 is intentionally stale (9d). 1 is from the recently-demoted skill and requires manual review.

## DORA metrics (90-day window)

Portfolio aggregates:
- **Lead time:** 4.8 days (up from 4.2 a month ago — slight degradation)
- **Deployment frequency:** 4.2/week (flat)
- **Change failure rate:** **11%** (up from 8% a month ago — **this is the regression**)
- **MTTR:** 2.3 hours (flat)

Per-project last-30d:

| Project | Lead time | Deploy freq | CFR | MTTR |
|---|---|---|---|---|
| internal-payments-api | 3.4 d | 6.2/wk | 8% | 1.8 h |
| data-warehouse-v2 | — | 0 | — | — |
| **auth-service-migration** | **5.7 d** | 4.8/wk | **18% ↑** | 4.2 h |
| kafka-pipeline-modernization | — | 0 | — | — |

**Story:** auth-service-migration is the single project driving the portfolio CFR regression. It correlates with 3 auto-merges by `schema-migration-reviewer` in the prior 14 days, which is what triggered the demotion. Click-through in Moment 5 reveals this attribution.

## Gates (current phase, per project)

```
internal-payments-api (Development):
  ● Code review coverage   passed   (3/3 PRs reviewed)
  ● Test coverage 80%+     passed   (84% line coverage)
  ● ADR-required check     passed   (ADR-0011 Outbox approved)
  ● Security scan          pending  (security-scan-runner Intern — manual gate)

data-warehouse-v2 (Design):
  ● Architecture review    passed   (3/3 design sessions logged)
  ● ADR Quorum (2+)        failed   (ADR-0014 + ADR-0015 still PENDING — assignee @rohan, 3d)
  ● Risk register          pending  (no entries yet)
  ● Stakeholder sign-off   skipped  (small-impact project — auto-skipped)

auth-service-migration (Testing):
  ● Test plan approved     passed   (test_plan plan_auth_t1 — APPROVED)
  ● E2E pass rate 95%+     failed   (currently 87% — 3 flakes in session-cookie suite)
  ● Rollback verified      passed   (incident plan_auth_i1 — RESOLVED with rollback dry-run)
  ● Change advisory sign-off  pending  (Jordan M., 1d)

kafka-pipeline-modernization (Requirements):
  ● Requirement quorum     pending  (1/3 requirements — need 3)
  ● Persona defined        passed   (proj_kafka.personas in frontmatter)
  ● Success criteria       pending  (0/3 requirements have explicit acceptance criteria)
```

## Recent autonomy events (last 14 days, portfolio-wide)

| Date | Event | Skill | Reason |
|---|---|---|---|
| 2026-05-09 | **Promoted Senior → Principal** | doc-updater | 30-day clean run across 4 projects, threshold met |
| 2026-05-10 | **Demoted Senior → Junior** | schema-migration-reviewer | CFR correlation incident on auth-service-migration |
| 2026-05-05 | Reviewed (held at Senior) | api-contract-checker | Quarterly review, no change |
| 2026-05-02 | Threshold pending | frontend-test-author | At Senior, eligible for Principal review on 2026-06-04 |
| 2026-04-30 | Set to Intern (initial) | security-scan-runner | New skill, default level |

## API key for Cursor MCP demo

```
sk_coznt_live_4f8a2b9c1e3d6h7j8k9m0n2p4q5r6s7t8u9v0w
```
(Obviously fictional. Use in mockups of the "Connect Cursor" modal.)

## Sample MCP `/context` response (for DX brief)

```json
{
  "project": {
    "id": "proj_pay",
    "name": "Internal Payments API",
    "slug": "internal-payments-api",
    "phase": "DEVELOPMENT"
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
      "link": "https://coznt.northwind.internal/rules/rule_iac"
    },
    {
      "id": "rule_obs",
      "title": "All payment endpoints must emit OpenTelemetry spans",
      "severity": "warn",
      "phase": "DEVELOPMENT",
      "link": "https://coznt.northwind.internal/rules/rule_obs"
    }
  ],
  "skills": [
    { "slug": "frontend-test-author", "level": "SENIOR", "autonomy": "auto-approve <50 LOC + 80% coverage" },
    { "slug": "api-contract-checker", "level": "SENIOR", "autonomy": "auto-approve schema-only changes" },
    { "slug": "doc-updater", "level": "PRINCIPAL", "autonomy": "auto-approve docs-only changes" }
  ],
  "adrs": [
    { "id": "adr_0011", "title": "Outbox pattern for payment webhooks", "link": "https://coznt.northwind.internal/plans/plan_pay_a1" }
  ],
  "responseTime": "318ms",
  "cacheStatus": "fresh"
}
```

## Notes for brief authors

- **Time zone:** UTC for stored timestamps; render relative (`3d ago`) in UI
- **Currencies/numbers:** never put currency-specific content in mocks — keep domain-neutral
- **PII:** all sample names are fictional; use them freely
- **The auth-service-migration regression is the live storyline** — most cross-project moments (5, 7) should make this story visible
- **`doc-updater` Principal promotion is the celebratory storyline** — Moment 4 should make this visible

Extend this fixture rather than inventing parallel realities in each brief.
