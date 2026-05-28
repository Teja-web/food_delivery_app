/**
 * Seed sample workspace — populates a brand-new org with the cross-linked
 * fixture documented in `docs/ux/sample-data.md`.
 *
 * Called from the onboarding flow when the user picks "Start with sample data".
 * Idempotent: if the org already has any project, the function returns early
 * without inserting anything (so re-running is safe).
 *
 * Insert order (forward FK chain):
 *   1. projects (5)              2. rules (8)
 *   3. skills (5)                4. skill_autonomy (~22 rows: 5 org + 17 per-project)
 *   5. skill_outcomes (~340 distributed across (skill, project) pairs, with
 *      Milestone-A sourceKind set: pr_merge / pr_revert / deploy_clean /
 *      deploy_incident; plus prompt_quality_signal rows tied to prompt_logs)
 *   5b. adapter_bindings (~10)   6. plans (17 — covering all 11 plan kinds)
 *   7. phase_gates (~19)         8. approvals (12)
 *   9. deployments (~16)         10. metrics (weekly aggregates × 90d)
 *   11. audit_logs               12. work_items                13. notifications
 *   14. webhook_events (~7)      15. gate_evaluations (~5)
 *   16. prompt_logs (~10)        17. test_runs (~4)
 *   18. repo_policies (~3)       19. custom_choreographies (~3)
 */

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@/db/client";
import { adapterBindings } from "@/db/schema/adapter-binding";
import { auditLogs } from "@/db/schema/audit-log";
import { approvals, type ApprovalEntityType } from "@/db/schema/approval";
import { customChoreographies } from "@/db/schema/custom-choreography";
import { deployments, type DeploymentStatus } from "@/db/schema/deployment";
import { gateEvaluations, type ChangeRisk, type GateVerdict } from "@/db/schema/gate-evaluation";
import { metrics, type MetricType } from "@/db/schema/metric";
import { phaseGates, type GateStatus, type GateType } from "@/db/schema/phase-gate";
import { plans, type PlanKind, type PlanStatus } from "@/db/schema/plan";
import { projects, type ProjectPhase } from "@/db/schema/project";
import { promptLogs, type PromptQualityTier, type VibeCodingTool } from "@/db/schema/prompt-log";
import { repoPolicies, type RepoPolicy } from "@/db/schema/repo-policy";
import { rules, type RuleSeverity } from "@/db/schema/rule";
import { notifications } from "@/db/schema/notification";
import { skillAutonomy } from "@/db/schema/skill-autonomy";
import { skillOutcomes, type SkillOutcomeSeverity, type SkillOutcomeSourceKind, type SkillOutcomeVerdict } from "@/db/schema/skill-outcome";
import { skills } from "@/db/schema/skill";
import { testRuns, type TestRunStatus } from "@/db/schema/test-run";
import { webhookEvents, type WebhookSource } from "@/db/schema/webhook-event";
import { workItems, type WorkItemKind, type WorkItemSource } from "@/db/schema/work-item";

const DAY = 86_400_000;

type ProjectSpec = {
  key: "proj_pay" | "proj_dw" | "proj_auth" | "proj_kafka" | "proj_obs";
  slug: string;
  name: string;
  description: string;
  phase: ProjectPhase;
  repoUrl: string | null;
  jiraProjectKey: string | null;
  adoProjectId?: string | null;
  confluenceSpaceKey?: string | null;
};

type SkillSpec = {
  key: "skill_fta" | "skill_smr" | "skill_acc" | "skill_du" | "skill_ssr";
  slug: string;
  name: string;
  description: string;
  body: string;
  level: 0 | 1 | 2 | 3;
  levelSetDaysAgo: number;
  lastReviewedDaysAgo: number;
  nextReviewDaysAhead: number;
  lastReason: string;
  stats: { success: number; rolledBack: number; incident: number };
};

type PlanSpec = {
  projectKey: ProjectSpec["key"];
  kind: PlanKind;
  title: string;
  summary: string;
  status: PlanStatus;
  priority?: "p0" | "p1" | "p2" | "p3";
  assigneeName?: string;
  externalRef?: string;
  daysAgoUpdated: number;
};

type RuleSpec = {
  projectKey: ProjectSpec["key"] | null;
  slug: string;
  title: string;
  body: string;
  phase: ProjectPhase | null;
  severity: RuleSeverity;
  tags: string[];
};

type GateSpec = {
  projectKey: ProjectSpec["key"];
  phase: ProjectPhase;
  name: string;
  description: string;
  type: GateType;
  status: GateStatus;
  unmetCriterion?: string;
  assigneeName?: string;
  daysAgoChanged: number;
};

type ApprovalSpec = {
  projectKey: ProjectSpec["key"];
  entityType: ApprovalEntityType;
  entityId: string;
  title: string;
  requestedByName: string;
  hoursAgo: number;
  phase: ProjectPhase;
};

type DeploymentSpec = {
  projectKey: ProjectSpec["key"];
  environment: string;
  version: string;
  status: DeploymentStatus;
  daysAgo: number;
  rolledBackReason?: string;
  deployedByName?: string;
};

// -------------------- FIXTURE --------------------

const PROJECT_SPECS: ProjectSpec[] = [
  {
    key: "proj_pay",
    slug: "internal-payments-api",
    name: "Internal Payments API",
    description: "Server-side payment capture, refund, and reconciliation surface for internal apps.",
    phase: "development",
    repoUrl: "https://github.com/northwind/payments-api",
    jiraProjectKey: "PAY",
  },
  {
    key: "proj_dw",
    slug: "data-warehouse-v2",
    name: "Data Warehouse v2",
    description: "Successor to the v1 nightly-batch warehouse — sub-hour freshness via logical decoding.",
    phase: "design",
    repoUrl: "https://github.com/northwind/dw-v2",
    jiraProjectKey: "DW",
  },
  {
    key: "proj_auth",
    slug: "auth-service-migration",
    name: "Auth Service Migration",
    description: "Move /auth/login from Devise to Better-Auth. Blocked on CFR regression.",
    phase: "testing",
    repoUrl: "https://github.com/northwind/auth",
    jiraProjectKey: "AUTH",
  },
  {
    key: "proj_kafka",
    slug: "kafka-pipeline-modernization",
    name: "Kafka Pipeline Modernization",
    description: "Replace v1 consumer-lag monitoring with continuous sampling + adaptive backpressure.",
    phase: "requirements",
    repoUrl: null,
    jiraProjectKey: "KAF",
  },
  {
    // Live-in-production service — drives the cicd/monitoring phases of the demo
    // and is the only project bound to Azure DevOps (so onboarding screens
    // showcase all four adapter providers).
    key: "proj_obs",
    slug: "internal-observability-stack",
    name: "Internal Observability Stack",
    description: "OTel collectors + Tempo + Loki — already in production, now in continuous-monitoring phase.",
    phase: "monitoring",
    repoUrl: "https://github.com/northwind/observability",
    jiraProjectKey: null,
    adoProjectId: "northwind/observability-platform",
    confluenceSpaceKey: "OBS",
  },
];

const SKILL_SPECS: SkillSpec[] = [
  {
    key: "skill_fta",
    slug: "frontend-test-author",
    name: "Frontend Test Author",
    description: "Generates Playwright / Vitest tests from a feature description and a code diff.",
    body: "Auto-author frontend tests. Auto-approve when LOC<50 and existing coverage ≥80%.",
    level: 2,
    levelSetDaysAgo: 24,
    lastReviewedDaysAgo: 7,
    nextReviewDaysAhead: 23,
    lastReason: "Quarterly review at Senior — held",
    stats: { success: 47, rolledBack: 2, incident: 0 },
  },
  {
    key: "skill_smr",
    slug: "schema-migration-reviewer",
    name: "Schema Migration Reviewer",
    description: "Reviews proposed DB migration files for safety and backwards-compat.",
    body: "Validate add-column NOT NULL with default, index online-create patterns, drop-without-rename guards.",
    level: 1,
    levelSetDaysAgo: 2,
    lastReviewedDaysAgo: 2,
    nextReviewDaysAhead: 28,
    lastReason: "Demoted Senior → Junior — CFR correlation incident on auth-service-migration",
    stats: { success: 18, rolledBack: 4, incident: 1 },
  },
  {
    key: "skill_acc",
    slug: "api-contract-checker",
    name: "API Contract Checker",
    description: "Compares proposed OpenAPI / GraphQL schema changes against consumers.",
    body: "Auto-approve schema-only changes that are pure additions; require human review otherwise.",
    level: 2,
    levelSetDaysAgo: 97,
    lastReviewedDaysAgo: 11,
    nextReviewDaysAhead: 19,
    lastReason: "Quarterly review — held at Senior",
    stats: { success: 92, rolledBack: 1, incident: 0 },
  },
  {
    key: "skill_du",
    slug: "doc-updater",
    name: "Doc Updater",
    description: "Keeps README / API docs / changelog in sync with code changes.",
    body: "Auto-approve docs-only changes. Promoted to Principal after 30-day clean run.",
    level: 3,
    levelSetDaysAgo: 3,
    lastReviewedDaysAgo: 4,
    nextReviewDaysAhead: 56,
    lastReason: "Promoted Senior → Principal — 30-day clean run across 4 projects",
    stats: { success: 156, rolledBack: 0, incident: 0 },
  },
  {
    key: "skill_ssr",
    slug: "security-scan-runner",
    name: "Security Scan Runner",
    description: "Runs SAST / dependency / secret-scan tooling and summarizes findings.",
    body: "Read-only at Intern; cannot auto-approve. Rollback rate must drop below 15% to promote.",
    level: 0,
    levelSetDaysAgo: 12,
    lastReviewedDaysAgo: 0,
    nextReviewDaysAhead: 7,
    lastReason: "New skill — default Intern level",
    stats: { success: 12, rolledBack: 8, incident: 0 },
  },
];

const PLAN_SPECS: PlanSpec[] = [
  { projectKey: "proj_pay", kind: "epic", title: "Payments platform v2.4 — capture/refund overhaul", summary: "Parent epic for the v2.4 release: idempotency, outbox webhooks, contract tests, phased rollout.", status: "in_progress", priority: "p1", assigneeName: "Sam Okafor", daysAgoUpdated: 16 },
  { projectKey: "proj_pay", kind: "story", title: "Idempotent retry for failed payment captures", summary: "Capture retries must dedupe via idempotency key, not network retry.", status: "approved", priority: "p1", assigneeName: "Aisha Patel", daysAgoUpdated: 14 },
  { projectKey: "proj_pay", kind: "adr", title: "Outbox pattern for payment webhooks", summary: "Use the outbox pattern over direct delivery for at-least-once webhook semantics.", status: "approved", assigneeName: "Devin Reyes", daysAgoUpdated: 9 },
  { projectKey: "proj_pay", kind: "feature", title: "Implement idempotency keys on POST /captures", summary: "Add Idempotency-Key header support backed by a 24h store.", status: "in_progress", priority: "p1", assigneeName: "Devin Reyes", externalRef: "https://northwind.atlassian.net/browse/PAY-1284", daysAgoUpdated: 1 },
  { projectKey: "proj_pay", kind: "test_plan", title: "Contract tests for v2.4 payment surface", summary: "Consumer-driven contract tests against the gateway and ledger.", status: "draft", priority: "p2", assigneeName: "Lena Volkov", daysAgoUpdated: 4 },
  { projectKey: "proj_pay", kind: "release_plan", title: "Q3 payments-API v2.4 rollout", summary: "Phased rollout: 5% → 25% → 100% over 7 days with auto-rollback on CFR > 12%.", status: "in_review", priority: "p0", assigneeName: "Sam Okafor", daysAgoUpdated: 0 },
  { projectKey: "proj_dw", kind: "story", title: "Sub-hour data freshness for analytics dashboards", summary: "BI dashboards must reflect production within 60 min, not 24h.", status: "approved", priority: "p1", assigneeName: "Yuki Tanaka", daysAgoUpdated: 21 },
  { projectKey: "proj_dw", kind: "adr", title: "Postgres logical decoding over Debezium for CDC", summary: "Native logical decoding reduces operational surface vs Debezium + Kafka Connect.", status: "in_review", assigneeName: "Yuki Tanaka", daysAgoUpdated: 3 },
  { projectKey: "proj_dw", kind: "adr", title: "Iceberg vs Delta Lake — storage layer", summary: "Pin a single table format for the v2 warehouse.", status: "in_review", assigneeName: "Yuki Tanaka", daysAgoUpdated: 3 },
  { projectKey: "proj_dw", kind: "storyboard", title: "Data flow storyboard — v1 batch → v2 streaming", summary: "Frame-by-frame walkthrough of how a row moves from app DB to BI dashboard in the v2 architecture.", status: "approved", priority: "p2", assigneeName: "Yuki Tanaka", daysAgoUpdated: 8 },
  { projectKey: "proj_auth", kind: "feature", title: "Migrate /auth/login from Devise to Better-Auth", summary: "Shadow-write Devise sessions during migration; cut over after 14d clean.", status: "in_progress", priority: "p0", assigneeName: "Marco Bianchi", daysAgoUpdated: 2 },
  { projectKey: "proj_auth", kind: "test_plan", title: "End-to-end auth migration smoke tests", summary: "Cover sign-in, sign-out, session rotation, password reset, OAuth callback.", status: "in_progress", priority: "p1", assigneeName: "Marco Bianchi", daysAgoUpdated: 2 },
  { projectKey: "proj_auth", kind: "incident", title: "Migration rollback 2026-05-08 — session cookie mismatch", summary: "Session cookie path mismatch caused mass sign-outs. Rolled back at T+11m.", status: "completed", priority: "p0", assigneeName: "Marco Bianchi", daysAgoUpdated: 4 },
  { projectKey: "proj_auth", kind: "dev_summary", title: "Auth migration — week 16 dev summary", summary: "Shadow-write window stabilized after rollback. 9 of 11 endpoints fully cut over; sign-out path still on Devise.", status: "approved", assigneeName: "Marco Bianchi", daysAgoUpdated: 2 },
  { projectKey: "proj_kafka", kind: "story", title: "Replace v1 consumer-lag monitoring with continuous sampling", summary: "Lag samples every 5s with adaptive backpressure on the producer side.", status: "draft", priority: "p2", assigneeName: "Rohan Desai", daysAgoUpdated: 1 },
  { projectKey: "proj_obs", kind: "cicd_pipeline", title: "Observability stack pipeline — Tekton + Argo CD", summary: "Build → bake OTel collector image → push → Argo CD sync. Canary auto-rollback on SLO regression.", status: "approved", priority: "p1", assigneeName: "Jordan Mwangi", daysAgoUpdated: 22 },
  { projectKey: "proj_obs", kind: "go_live_report", title: "Observability stack — go-live retrospective", summary: "First 30 days in production: 99.97% uptime, 2 collector OOMs (since fixed), MTTR 28 min average.", status: "completed", priority: "p2", assigneeName: "Sam Okafor", daysAgoUpdated: 11 },
];

const RULE_SPECS: RuleSpec[] = [
  { projectKey: null, slug: "no-direct-db-import", title: "No direct db imports in page components", body: "Pages must call operations or actions. Direct `db` import in app/ is rejected.", phase: null, severity: "error", tags: ["architecture", "convention"] },
  { projectKey: null, slug: "pr-checklist-complete", title: "PR description must include the checklist", body: "Required: rollout, monitoring, rollback plan. PRs without a complete checklist auto-fail review.", phase: null, severity: "warn", tags: ["pr-checklist", "process"] },
  { projectKey: null, slug: "no-secrets-in-code", title: "No secrets in source code", body: "Detect AWS/GCP/Azure tokens, OpenAI keys, GitHub PATs. Move to env or secret manager.", phase: null, severity: "error", tags: ["security"] },
  { projectKey: null, slug: "adr-required-for-architecture", title: "Architecture changes require an ADR", body: "Changes touching service boundaries, data flow, or 3rd-party providers need an ADR.", phase: "design", severity: "warn", tags: ["adr", "process"] },
  { projectKey: "proj_pay", slug: "idempotency-on-payment-writes", title: "All payment-write endpoints require idempotency keys", body: "POST/PUT on /captures, /refunds, /payouts must accept and persist Idempotency-Key.", phase: "development", severity: "error", tags: ["payments", "reliability"] },
  { projectKey: "proj_pay", slug: "otel-spans-on-payment-endpoints", title: "All payment endpoints must emit OpenTelemetry spans", body: "Span name follows `payments.{op}` and includes the idempotency-key fingerprint.", phase: "development", severity: "warn", tags: ["observability", "payments"] },
  { projectKey: "proj_auth", slug: "auth-tokens-never-logged", title: "Auth tokens must never appear in logs", body: "Session tokens, refresh tokens, OAuth codes — redact at the logger middleware.", phase: null, severity: "error", tags: ["security", "auth"] },
  { projectKey: "proj_dw", slug: "schema-changes-via-migration", title: "Schema changes must go through migrations", body: "No raw ALTER TABLE in app code or CI scripts. Use the versioned migration folder.", phase: "design", severity: "error", tags: ["schema", "process"] },
];

const GATE_SPECS: GateSpec[] = [
  // proj_pay (development)
  { projectKey: "proj_pay", phase: "development", name: "Code review coverage", description: "Every PR has been reviewed by at least 1 non-author.", type: "approval", status: "passed", daysAgoChanged: 2 },
  { projectKey: "proj_pay", phase: "development", name: "Test coverage 80%+", description: "Line coverage on changed files ≥ 80%.", type: "coverage", status: "passed", daysAgoChanged: 1 },
  { projectKey: "proj_pay", phase: "development", name: "ADR-required check", description: "Architecture changes have a linked approved ADR.", type: "custom", status: "passed", daysAgoChanged: 3 },
  { projectKey: "proj_pay", phase: "development", name: "Security scan", description: "Latest security scan passes.", type: "security", status: "pending", unmetCriterion: "security-scan-runner Intern — manual gate", assigneeName: "Jordan Mwangi", daysAgoChanged: 0 },
  // proj_dw (design)
  { projectKey: "proj_dw", phase: "design", name: "Architecture review", description: "3+ design sessions logged with stakeholders.", type: "approval", status: "passed", daysAgoChanged: 6 },
  { projectKey: "proj_dw", phase: "design", name: "ADR Quorum (2+)", description: "At least 2 approved ADRs covering core decisions.", type: "custom", status: "failed", unmetCriterion: "ADR-0014 + ADR-0015 still in review — assignee Rohan", assigneeName: "Rohan Desai", daysAgoChanged: 3 },
  { projectKey: "proj_dw", phase: "design", name: "Risk register", description: "Risks enumerated with mitigation owners.", type: "custom", status: "pending", unmetCriterion: "No entries yet", assigneeName: "Sam Okafor", daysAgoChanged: 0 },
  { projectKey: "proj_dw", phase: "design", name: "Stakeholder sign-off", description: "All listed stakeholders explicitly sign off.", type: "approval", status: "skipped", daysAgoChanged: 8 },
  // proj_auth (testing)
  { projectKey: "proj_auth", phase: "testing", name: "Test plan approved", description: "Test plan plan has status=approved.", type: "approval", status: "passed", daysAgoChanged: 2 },
  { projectKey: "proj_auth", phase: "testing", name: "E2E pass rate 95%+", description: "End-to-end suite passes at ≥95%.", type: "coverage", status: "failed", unmetCriterion: "87% — 3 flakes in session-cookie suite", assigneeName: "Marco Bianchi", daysAgoChanged: 0 },
  { projectKey: "proj_auth", phase: "testing", name: "Rollback verified", description: "Rollback procedure tested in staging.", type: "custom", status: "passed", daysAgoChanged: 3 },
  { projectKey: "proj_auth", phase: "testing", name: "Change advisory sign-off", description: "CAB / on-call sign-off recorded.", type: "approval", status: "pending", assigneeName: "Jordan Mwangi", daysAgoChanged: 1 },
  // proj_kafka (requirements)
  { projectKey: "proj_kafka", phase: "requirements", name: "Requirement quorum", description: "Minimum 3 requirements documented and approved.", type: "custom", status: "pending", unmetCriterion: "1/3 requirements — need 3", assigneeName: "Sam Okafor", daysAgoChanged: 0 },
  { projectKey: "proj_kafka", phase: "requirements", name: "Persona defined", description: "User personas captured in project frontmatter.", type: "custom", status: "passed", daysAgoChanged: 5 },
  { projectKey: "proj_kafka", phase: "requirements", name: "Success criteria", description: "Each requirement has explicit acceptance criteria.", type: "custom", status: "pending", unmetCriterion: "0/3 requirements have explicit acceptance criteria", assigneeName: "Rohan Desai", daysAgoChanged: 0 },
  // proj_obs (monitoring) — live-in-prod project, all the cicd→monitoring gates closed
  { projectKey: "proj_obs", phase: "cicd", name: "Pipeline definition", description: "cicd_pipeline plan exists and is approved.", type: "custom", status: "passed", daysAgoChanged: 22 },
  { projectKey: "proj_obs", phase: "cicd", name: "Canary rollback drill", description: "Documented procedure validated against staging.", type: "custom", status: "passed", daysAgoChanged: 18 },
  { projectKey: "proj_obs", phase: "monitoring", name: "SLO baseline established", description: "Burn-rate alerts wired to PagerDuty against signed-off targets.", type: "custom", status: "passed", daysAgoChanged: 11 },
  { projectKey: "proj_obs", phase: "monitoring", name: "Runbook published", description: "Incident response runbook linked in Confluence.", type: "custom", status: "passed", daysAgoChanged: 11 },
  { projectKey: "proj_obs", phase: "monitoring", name: "On-call rotation defined", description: "Primary + secondary rotation, escalation policy approved.", type: "approval", status: "pending", unmetCriterion: "Secondary rotation slot still empty for week 24", assigneeName: "Jordan Mwangi", daysAgoChanged: 2 },
  { projectKey: "proj_obs", phase: "monitoring", name: "MTTR < 2h", description: "Rolling 30-day MTTR under 2 hours.", type: "custom", status: "passed", daysAgoChanged: 1 },
];

const APPROVAL_SPECS: ApprovalSpec[] = [
  { projectKey: "proj_pay", entityType: "plan", entityId: "plan_pay_rel1", title: "Release Q3 v2.4 rollout", requestedByName: "Devin Reyes", hoursAgo: 2, phase: "cicd" },
  { projectKey: "proj_pay", entityType: "phase_gate", entityId: "gate_pay_dev2test", title: "Development → Testing gate", requestedByName: "system", hoursAgo: 5, phase: "development" },
  { projectKey: "proj_pay", entityType: "work_item", entityId: "PR-1284", title: "PR #1284 idempotency-keys", requestedByName: "api-contract-checker (bot)", hoursAgo: 24, phase: "development" },
  { projectKey: "proj_dw", entityType: "plan", entityId: "plan_dw_a1", title: "ADR-0014 logical decoding", requestedByName: "Yuki Tanaka", hoursAgo: 72, phase: "design" },
  { projectKey: "proj_dw", entityType: "plan", entityId: "plan_dw_a2", title: "ADR-0015 Iceberg vs Delta", requestedByName: "Yuki Tanaka", hoursAgo: 72, phase: "design" },
  { projectKey: "proj_dw", entityType: "phase_gate", entityId: "gate_dw_design2dev", title: "Design → Development gate (4 unmet criteria)", requestedByName: "system", hoursAgo: 48, phase: "design" },
  { projectKey: "proj_dw", entityType: "work_item", entityId: "PR-93", title: "PR #93 schema-init (demoted skill — manual review)", requestedByName: "schema-migration-reviewer (bot)", hoursAgo: 4, phase: "design" },
  { projectKey: "proj_auth", entityType: "release", entityId: "release_auth_hotfix", title: "Hotfix rollback session-cookie", requestedByName: "Marco Bianchi", hoursAgo: 216, phase: "testing" },
  { projectKey: "proj_auth", entityType: "work_item", entityId: "PR-441", title: "PR #441 session-cookie-fix", requestedByName: "frontend-test-author (bot)", hoursAgo: 6, phase: "testing" },
  { projectKey: "proj_kafka", entityType: "plan", entityId: "plan_kafka_r1", title: "Requirement: consumer lag sampling", requestedByName: "Rohan Desai", hoursAgo: 24, phase: "requirements" },
  { projectKey: "proj_kafka", entityType: "plan", entityId: "adr_stream_processor", title: "ADR: stream-processor choice", requestedByName: "Rohan Desai", hoursAgo: 24, phase: "requirements" },
  { projectKey: "proj_pay", entityType: "work_item", entityId: "PR-1290", title: "PR #1290 docs-updater output (Principal — auto-eligible)", requestedByName: "doc-updater (bot)", hoursAgo: 0.5, phase: "development" },
];

type WorkItemSpec = {
  projectKey: ProjectSpec["key"];
  source: WorkItemSource;
  externalId: string;
  externalUrl: string;
  kind: WorkItemKind;
  title: string;
  status: string;
  assigneeEmail: string;
  daysAgoUpdated: number;
};

const WORK_ITEM_SPECS: WorkItemSpec[] = [
  // proj_pay — active development on idempotency keys + outbox + rollout
  { projectKey: "proj_pay", source: "github", externalId: "PR-1284", externalUrl: "https://github.com/northwind/payments-api/pull/1284", kind: "pull_request", title: "Add idempotency-key support to POST /captures", status: "open", assigneeEmail: "devin.reyes@northwind.test", daysAgoUpdated: 0 },
  { projectKey: "proj_pay", source: "github", externalId: "PR-1290", externalUrl: "https://github.com/northwind/payments-api/pull/1290", kind: "pull_request", title: "docs: payment-webhook outbox reference", status: "open", assigneeEmail: "doc-updater@bot.coznt", daysAgoUpdated: 0 },
  { projectKey: "proj_pay", source: "github", externalId: "PR-1278", externalUrl: "https://github.com/northwind/payments-api/pull/1278", kind: "pull_request", title: "Refactor capture retry loop", status: "merged", assigneeEmail: "aisha.patel@northwind.test", daysAgoUpdated: 3 },
  { projectKey: "proj_pay", source: "jira", externalId: "PAY-1284", externalUrl: "https://northwind.atlassian.net/browse/PAY-1284", kind: "story", title: "Idempotent retry for failed payment captures", status: "In Progress", assigneeEmail: "devin.reyes@northwind.test", daysAgoUpdated: 1 },
  { projectKey: "proj_pay", source: "jira", externalId: "PAY-1290", externalUrl: "https://northwind.atlassian.net/browse/PAY-1290", kind: "task", title: "Document outbox pattern in API guide", status: "Done", assigneeEmail: "doc-updater@bot.coznt", daysAgoUpdated: 0 },
  { projectKey: "proj_pay", source: "jira", externalId: "PAY-1305", externalUrl: "https://northwind.atlassian.net/browse/PAY-1305", kind: "bug", title: "Webhook retries duplicate on transient 500", status: "In Progress", assigneeEmail: "lena.volkov@northwind.test", daysAgoUpdated: 2 },
  { projectKey: "proj_pay", source: "confluence", externalId: "CONF-2104", externalUrl: "https://northwind.atlassian.net/wiki/spaces/PAY/pages/2104", kind: "page", title: "Payments API — runbook v2.4", status: "current", assigneeEmail: "sam.okafor@northwind.test", daysAgoUpdated: 4 },

  // proj_dw — design phase, ADRs in review
  { projectKey: "proj_dw", source: "github", externalId: "PR-93", externalUrl: "https://github.com/northwind/data-warehouse-v2/pull/93", kind: "pull_request", title: "Initial schema for v2 warehouse (under manual review)", status: "open", assigneeEmail: "yuki.tanaka@northwind.test", daysAgoUpdated: 0 },
  { projectKey: "proj_dw", source: "jira", externalId: "DW-204", externalUrl: "https://northwind.atlassian.net/browse/DW-204", kind: "story", title: "Sub-hour data freshness for analytics dashboards", status: "Approved", assigneeEmail: "yuki.tanaka@northwind.test", daysAgoUpdated: 21 },
  { projectKey: "proj_dw", source: "confluence", externalId: "CONF-3001", externalUrl: "https://northwind.atlassian.net/wiki/spaces/DW/pages/3001", kind: "page", title: "Data Warehouse v2 — Design Doc", status: "draft", assigneeEmail: "yuki.tanaka@northwind.test", daysAgoUpdated: 3 },

  // proj_auth — testing phase, recent rollback
  { projectKey: "proj_auth", source: "github", externalId: "PR-441", externalUrl: "https://github.com/northwind/auth-service/pull/441", kind: "pull_request", title: "Fix session cookie path after migration", status: "open", assigneeEmail: "marco.bianchi@northwind.test", daysAgoUpdated: 0 },
  { projectKey: "proj_auth", source: "github", externalId: "PR-438", externalUrl: "https://github.com/northwind/auth-service/pull/438", kind: "pull_request", title: "Revert v1.8.1 — session-cookie regression", status: "merged", assigneeEmail: "marco.bianchi@northwind.test", daysAgoUpdated: 4 },
  { projectKey: "proj_auth", source: "jira", externalId: "AUTH-310", externalUrl: "https://northwind.atlassian.net/browse/AUTH-310", kind: "story", title: "Migrate /auth/login from Devise to Better-Auth", status: "In Progress", assigneeEmail: "marco.bianchi@northwind.test", daysAgoUpdated: 2 },
  { projectKey: "proj_auth", source: "jira", externalId: "AUTH-318", externalUrl: "https://northwind.atlassian.net/browse/AUTH-318", kind: "bug", title: "Mass sign-out after v1.8.1 deploy", status: "Done", assigneeEmail: "marco.bianchi@northwind.test", daysAgoUpdated: 4 },

  // proj_kafka — requirements phase
  { projectKey: "proj_kafka", source: "jira", externalId: "KAF-12", externalUrl: "https://northwind.atlassian.net/browse/KAF-12", kind: "story", title: "Replace v1 consumer-lag monitoring with continuous sampling", status: "Draft", assigneeEmail: "rohan.desai@northwind.test", daysAgoUpdated: 1 },
];

type NotificationSpec = {
  subject: string;
  body: string;
  link: string;
  entityType: string;
  hoursAgo: number;
  read: boolean;
};

const NOTIFICATION_SPECS: NotificationSpec[] = [
  {
    subject: "Approval requested: Q3 v2.4 rollout",
    body: "Devin Reyes is asking you to sign off on the Q3 payments-API v2.4 release plan.",
    link: "/approvals",
    entityType: "release",
    hoursAgo: 2,
    read: false,
  },
  {
    subject: "Gate failed: Code review coverage",
    body: "internal-payments-api · Development phase — Security Scan gate awaiting manual review (@Jordan Mwangi).",
    link: "/projects",
    entityType: "phase_gate",
    hoursAgo: 1,
    read: false,
  },
  {
    subject: "Skill promoted: doc-updater Senior → Principal",
    body: "30-day clean run across 4 projects. New permissions unlocked: auto-eligible PR comments on principal-flagged repos.",
    link: "/skills",
    entityType: "skill_outcome",
    hoursAgo: 6,
    read: false,
  },
  {
    subject: "Deployment rolled back: auth-service v1.8.1",
    body: "session cookie path mismatch caused mass sign-outs. Rolled back at T+11m.",
    link: "/releases",
    entityType: "deployment",
    hoursAgo: 96,
    read: true,
  },
  {
    subject: "ADR approved: Outbox pattern for payment webhooks",
    body: "in_review → approved by Aisha Patel.",
    link: "/plans",
    entityType: "plan",
    hoursAgo: 216,
    read: true,
  },
  {
    subject: "Skill demoted: schema-migration-reviewer Senior → Junior",
    body: "1 incident on auth-service migration. Now requires manual sign-off on data-warehouse-v2 schema changes.",
    link: "/skills",
    entityType: "skill_outcome",
    hoursAgo: 168,
    read: true,
  },
  {
    subject: "Approval requested: ADR-0014 logical decoding",
    body: "Yuki Tanaka is asking for sign-off on the CDC choice — Postgres logical decoding over Debezium.",
    link: "/approvals",
    entityType: "plan",
    hoursAgo: 72,
    read: true,
  },
];

const DEPLOYMENT_SPECS: DeploymentSpec[] = [
  // proj_pay — healthy: 6.2/wk × ~4 weeks ≈ 25 deploys; sample 7 with mostly success
  { projectKey: "proj_pay", environment: "production", version: "v2.3.4", status: "success", daysAgo: 3, deployedByName: "Devin Reyes" },
  { projectKey: "proj_pay", environment: "production", version: "v2.3.3", status: "success", daysAgo: 6, deployedByName: "Aisha Patel" },
  { projectKey: "proj_pay", environment: "production", version: "v2.3.2", status: "success", daysAgo: 9, deployedByName: "Devin Reyes" },
  { projectKey: "proj_pay", environment: "production", version: "v2.3.1", status: "failed", daysAgo: 13, deployedByName: "Devin Reyes", rolledBackReason: "Health check timeout — rolled back at T+4m" },
  { projectKey: "proj_pay", environment: "production", version: "v2.3.0", status: "success", daysAgo: 17, deployedByName: "Marco Bianchi" },
  { projectKey: "proj_pay", environment: "production", version: "v2.2.7", status: "success", daysAgo: 22, deployedByName: "Aisha Patel" },
  { projectKey: "proj_pay", environment: "production", version: "v2.2.6", status: "success", daysAgo: 27, deployedByName: "Devin Reyes" },
  // proj_auth — regressed: 18% CFR. 4.8/wk × ~4w ≈ 19 deploys; sample 8 with 2 rollbacks
  { projectKey: "proj_auth", environment: "production", version: "auth-1.8.2", status: "success", daysAgo: 2, deployedByName: "Marco Bianchi" },
  { projectKey: "proj_auth", environment: "production", version: "auth-1.8.1", status: "rolled_back", daysAgo: 4, deployedByName: "Marco Bianchi", rolledBackReason: "Session cookie path mismatch caused mass sign-outs" },
  { projectKey: "proj_auth", environment: "production", version: "auth-1.8.0", status: "success", daysAgo: 8, deployedByName: "Marco Bianchi" },
  { projectKey: "proj_auth", environment: "production", version: "auth-1.7.9", status: "rolled_back", daysAgo: 11, deployedByName: "Aisha Patel", rolledBackReason: "schema-migration-reviewer auto-approved a NOT NULL backfill that timed out" },
  { projectKey: "proj_auth", environment: "production", version: "auth-1.7.8", status: "success", daysAgo: 15, deployedByName: "Marco Bianchi" },
  { projectKey: "proj_auth", environment: "production", version: "auth-1.7.7", status: "success", daysAgo: 19, deployedByName: "Devin Reyes" },
  { projectKey: "proj_auth", environment: "production", version: "auth-1.7.6", status: "failed", daysAgo: 24, deployedByName: "Marco Bianchi", rolledBackReason: "CI green but prod sanity check failed" },
  { projectKey: "proj_auth", environment: "production", version: "auth-1.7.5", status: "success", daysAgo: 28, deployedByName: "Marco Bianchi" },
];

const DORA_METRICS: Array<{ projectKey: ProjectSpec["key"]; type: MetricType; value: number; unit: string }> = [
  { projectKey: "proj_pay", type: "lead_time", value: 3.4, unit: "d" },
  { projectKey: "proj_pay", type: "deployment_frequency", value: 6.2, unit: "/wk" },
  { projectKey: "proj_pay", type: "change_failure_rate", value: 0.08, unit: "ratio" },
  { projectKey: "proj_pay", type: "mttr", value: 1.8, unit: "h" },
  { projectKey: "proj_auth", type: "lead_time", value: 5.7, unit: "d" },
  { projectKey: "proj_auth", type: "deployment_frequency", value: 4.8, unit: "/wk" },
  { projectKey: "proj_auth", type: "change_failure_rate", value: 0.18, unit: "ratio" },
  { projectKey: "proj_auth", type: "mttr", value: 4.2, unit: "h" },
];

const AUTONOMY_EVENTS: Array<{
  skillKey: SkillSpec["key"];
  daysAgo: number;
  action: string;
  summary: string;
}> = [
  { skillKey: "skill_du", daysAgo: 3, action: "skill.promotion", summary: "SENIOR → PRINCIPAL — 30-day clean run across 4 projects, threshold met" },
  { skillKey: "skill_smr", daysAgo: 2, action: "skill.demotion", summary: "SENIOR → JUNIOR — CFR correlation incident on auth-service-migration" },
  { skillKey: "skill_acc", daysAgo: 7, action: "skill.reviewed", summary: "Quarterly review at Senior — held" },
  { skillKey: "skill_fta", daysAgo: 10, action: "skill.threshold_pending", summary: "Eligible for Principal review on 2026-06-04" },
  { skillKey: "skill_ssr", daysAgo: 12, action: "skill.created", summary: "Set to Intern (initial)" },
];

/**
 * Per-(skill, project) autonomy fixture. Drives both the per-project
 * `skill_autonomy` rows and the weighting that distributes the 341
 * skill_outcomes across projects (a higher level on a project implies the
 * skill ran more there and had cleaner outcomes).
 *
 * Levels: 0=Intern, 1=Junior, 2=Senior, 3=Principal. Skills with no row on
 * a project simply haven't been invoked there yet (and produce no outcomes).
 */
type SkillProjectAutonomy = {
  skillKey: SkillSpec["key"];
  projectKey: ProjectSpec["key"];
  level: 0 | 1 | 2 | 3;
  /** Weight for distributing this skill's `stats` outcomes across projects (sums to ~1 per skill). */
  outcomeWeight: number;
  levelSetDaysAgo: number;
  lastReason: string;
};

const SKILL_PROJECT_AUTONOMY: SkillProjectAutonomy[] = [
  // frontend-test-author (org Senior): strong on auth+pay, lighter on dw, no kafka work yet
  { skillKey: "skill_fta", projectKey: "proj_pay", level: 2, outcomeWeight: 0.45, levelSetDaysAgo: 24, lastReason: "Held at Senior — 22/22 success on payments suite" },
  { skillKey: "skill_fta", projectKey: "proj_auth", level: 2, outcomeWeight: 0.40, levelSetDaysAgo: 18, lastReason: "Held at Senior — clean run after migration cutover" },
  { skillKey: "skill_fta", projectKey: "proj_dw", level: 1, outcomeWeight: 0.15, levelSetDaysAgo: 9, lastReason: "Junior — fewer test surfaces, still building track record" },

  // schema-migration-reviewer (org Junior, demoted): demoted on auth (incident site), junior on dw
  { skillKey: "skill_smr", projectKey: "proj_auth", level: 0, outcomeWeight: 0.35, levelSetDaysAgo: 2, lastReason: "Demoted to Intern — auto-approved NOT NULL backfill that triggered prod rollback" },
  { skillKey: "skill_smr", projectKey: "proj_dw", level: 1, outcomeWeight: 0.50, levelSetDaysAgo: 2, lastReason: "Demoted Senior → Junior — cross-project caution after auth incident" },
  { skillKey: "skill_smr", projectKey: "proj_pay", level: 1, outcomeWeight: 0.15, levelSetDaysAgo: 2, lastReason: "Demoted Senior → Junior — cross-project caution" },

  // api-contract-checker (org Senior): everywhere there's API work, light on kafka
  { skillKey: "skill_acc", projectKey: "proj_pay", level: 2, outcomeWeight: 0.42, levelSetDaysAgo: 90, lastReason: "Senior — 40/40 contract checks on payments-api clean" },
  { skillKey: "skill_acc", projectKey: "proj_auth", level: 2, outcomeWeight: 0.32, levelSetDaysAgo: 85, lastReason: "Senior — held across auth migration" },
  { skillKey: "skill_acc", projectKey: "proj_dw", level: 2, outcomeWeight: 0.20, levelSetDaysAgo: 70, lastReason: "Senior — held on warehouse API surface" },
  { skillKey: "skill_acc", projectKey: "proj_kafka", level: 1, outcomeWeight: 0.06, levelSetDaysAgo: 14, lastReason: "Junior — only 5 outcomes, still bootstrapping" },

  // doc-updater (org Principal, just promoted): runs everywhere, just promoted on pay+auth+dw
  { skillKey: "skill_du", projectKey: "proj_pay", level: 3, outcomeWeight: 0.30, levelSetDaysAgo: 3, lastReason: "Promoted Senior → Principal — 30-day clean run on payments docs" },
  { skillKey: "skill_du", projectKey: "proj_auth", level: 3, outcomeWeight: 0.26, levelSetDaysAgo: 3, lastReason: "Promoted Senior → Principal — 30-day clean run on auth docs" },
  { skillKey: "skill_du", projectKey: "proj_dw", level: 3, outcomeWeight: 0.28, levelSetDaysAgo: 3, lastReason: "Promoted Senior → Principal — 30-day clean run on warehouse docs" },
  { skillKey: "skill_du", projectKey: "proj_kafka", level: 2, outcomeWeight: 0.16, levelSetDaysAgo: 12, lastReason: "Senior — newer project, not yet at Principal threshold here" },

  // security-scan-runner (org Intern): auth-heavy (security-sensitive), light pay+dw
  { skillKey: "skill_ssr", projectKey: "proj_auth", level: 0, outcomeWeight: 0.60, levelSetDaysAgo: 12, lastReason: "Intern — 8 rollbacks vs 6 successes, rollback rate above threshold" },
  { skillKey: "skill_ssr", projectKey: "proj_pay", level: 0, outcomeWeight: 0.30, levelSetDaysAgo: 12, lastReason: "Intern — initial level" },
  { skillKey: "skill_ssr", projectKey: "proj_dw", level: 0, outcomeWeight: 0.10, levelSetDaysAgo: 12, lastReason: "Intern — initial level" },
];

/** Adapter bindings — what external systems each project is wired to. */
type BindingSpec = {
  projectKey: ProjectSpec["key"];
  provider: "github" | "jira" | "ado" | "confluence";
  externalKey: string;
};

const BINDING_SPECS: BindingSpec[] = [
  { projectKey: "proj_pay", provider: "github", externalKey: "github.com/northwind/payments-api" },
  { projectKey: "proj_pay", provider: "jira", externalKey: "PAY" },
  { projectKey: "proj_pay", provider: "confluence", externalKey: "PAY" },
  { projectKey: "proj_dw", provider: "github", externalKey: "github.com/northwind/dw-v2" },
  { projectKey: "proj_dw", provider: "jira", externalKey: "DW" },
  { projectKey: "proj_auth", provider: "github", externalKey: "github.com/northwind/auth" },
  { projectKey: "proj_auth", provider: "jira", externalKey: "AUTH" },
  { projectKey: "proj_kafka", provider: "jira", externalKey: "KAF" },
  { projectKey: "proj_obs", provider: "github", externalKey: "github.com/northwind/observability" },
  { projectKey: "proj_obs", provider: "ado", externalKey: "northwind/observability-platform" },
  { projectKey: "proj_obs", provider: "confluence", externalKey: "OBS" },
];

/** Prompt-quality-hook fixtures — what shows up in `/agent-loop` and feeds
 *  `prompt_quality_signal` outcomes when score < GOOD. */
type PromptLogSpec = {
  projectKey: ProjectSpec["key"];
  source: VibeCodingTool;
  authorName: string;
  authorEmail: string;
  content: string;
  phase: ProjectPhase | null;
  promptScore: number;
  promptTier: PromptQualityTier;
  hoursAgo: number;
};

const PROMPT_LOG_SPECS: PromptLogSpec[] = [
  { projectKey: "proj_pay", source: "CLAUDE_CODE", authorName: "Devin Reyes", authorEmail: "devin.reyes@northwind.test", content: "Implement Idempotency-Key middleware on POST /captures. Header must be required, store in Redis for 24h, return cached response on replay. Add a unit test that asserts replayed requests don't double-charge.", phase: "development", promptScore: 92, promptTier: "GOOD", hoursAgo: 4 },
  { projectKey: "proj_pay", source: "CLAUDE_CODE", authorName: "Devin Reyes", authorEmail: "devin.reyes@northwind.test", content: "make the retry thing work", phase: "development", promptScore: 28, promptTier: "POOR", hoursAgo: 10 },
  { projectKey: "proj_pay", source: "CURSOR", authorName: "Aisha Patel", authorEmail: "aisha.patel@northwind.test", content: "Refactor the payment capture loop to dedupe on idempotency key. Keep the existing 3-attempt retry but only on transport errors, not on 4xx.", phase: "development", promptScore: 81, promptTier: "GOOD", hoursAgo: 26 },
  { projectKey: "proj_auth", source: "CLAUDE_CODE", authorName: "Marco Bianchi", authorEmail: "marco.bianchi@northwind.test", content: "fix the session cookie", phase: "testing", promptScore: 35, promptTier: "POOR", hoursAgo: 50 },
  { projectKey: "proj_auth", source: "CLAUDE_CODE", authorName: "Marco Bianchi", authorEmail: "marco.bianchi@northwind.test", content: "Session cookie path is set to /api in v1.8.1 but front-end calls /auth/* directly, so the browser drops the cookie. Patch the cookie path to / and add a regression test that signs in, hits /auth/me from a different mount point, and asserts the session survives.", phase: "testing", promptScore: 88, promptTier: "GOOD", hoursAgo: 6 },
  { projectKey: "proj_dw", source: "WINDSURF", authorName: "Yuki Tanaka", authorEmail: "yuki.tanaka@northwind.test", content: "Add an ADR comparing Iceberg vs Delta Lake for the v2 warehouse. Include: write amplification on small partitions, vendor lock-in, support for the columns we'll need (geo, vector). Decide.", phase: "design", promptScore: 95, promptTier: "GOOD", hoursAgo: 80 },
  { projectKey: "proj_dw", source: "COPILOT", authorName: "Rohan Desai", authorEmail: "rohan.desai@northwind.test", content: "more performance", phase: "design", promptScore: 22, promptTier: "POOR", hoursAgo: 96 },
  { projectKey: "proj_dw", source: "CODEX", authorName: "Yuki Tanaka", authorEmail: "yuki.tanaka@northwind.test", content: "Sketch the CDC pipeline: logical-replication slot → consumer → Iceberg writer. Show backpressure handling.", phase: "design", promptScore: 64, promptTier: "NEEDS_IMPROVEMENT", hoursAgo: 36 },
  { projectKey: "proj_obs", source: "CLAUDE_CODE", authorName: "Jordan Mwangi", authorEmail: "jordan.mwangi@northwind.test", content: "Wire the SLO burn-rate alert to PagerDuty. 2% budget per hour triggers P2, 5%/hr triggers P1. Use the existing burnrate recording rule.", phase: "monitoring", promptScore: 90, promptTier: "GOOD", hoursAgo: 18 },
  { projectKey: "proj_obs", source: "CURSOR", authorName: "Jordan Mwangi", authorEmail: "jordan.mwangi@northwind.test", content: "alert when bad", phase: "monitoring", promptScore: 18, promptTier: "POOR", hoursAgo: 72 },
];

/** Inbound webhook deliveries — the left half of the user-guide loop diagram. */
type WebhookEventSpec = {
  source: WebhookSource;
  externalId: string;
  event: string;
  payloadSummary: string;
  hoursAgo: number;
  processed: boolean;
  processingError?: string;
};

const WEBHOOK_EVENT_SPECS: WebhookEventSpec[] = [
  { source: "github", externalId: "delivery-12af-001", event: "pull_request.opened", payloadSummary: "PR #1284 idempotency-keys (devin.reyes → main)", hoursAgo: 26, processed: true },
  { source: "github", externalId: "delivery-12af-002", event: "pull_request.closed", payloadSummary: "PR #1278 capture-retry-refactor merged", hoursAgo: 72, processed: true },
  { source: "github", externalId: "delivery-3344-007", event: "deployment_status", payloadSummary: "auth-service v1.8.2 → production: success", hoursAgo: 48, processed: true },
  { source: "github", externalId: "delivery-3344-006", event: "deployment_status", payloadSummary: "auth-service v1.8.1 → production: failure (rolled back at T+11m)", hoursAgo: 96, processed: true },
  { source: "github", externalId: "delivery-9bb-118", event: "pull_request.reopened", payloadSummary: "PR #441 session-cookie-fix reopened after schema-migration-reviewer demotion", hoursAgo: 6, processed: false, processingError: "Awaiting gate re-evaluation — schema-migration-reviewer Junior on auth-service" },
  { source: "jira", externalId: "JIRA-evt-PAY-1305", event: "issue.updated", payloadSummary: "PAY-1305 transitioned Open → In Progress", hoursAgo: 50, processed: true },
  { source: "ado", externalId: "ADO-evt-OBS-77", event: "workitem.updated", payloadSummary: "Observability-Platform/77 (Argo CD sync interval) closed", hoursAgo: 18, processed: true },
];

/** Execution-gate decisions — Milestone-D table. */
type GateEvaluationSpec = {
  projectKey: ProjectSpec["key"];
  prRef: string;
  prTitle: string;
  prHeadSha: string;
  skillKey: SkillSpec["key"] | null;
  autonomyAtEval: string;
  verdict: GateVerdict;
  reason: string;
  details: string[];
  changeRisk: ChangeRisk;
  humanOverride: boolean;
  checkRunError?: string;
  hoursAgo: number;
};

const GATE_EVALUATION_SPECS: GateEvaluationSpec[] = [
  { projectKey: "proj_pay", prRef: "PR-1284", prTitle: "Add idempotency-key support to POST /captures", prHeadSha: "a4f1d0c", skillKey: "skill_acc", autonomyAtEval: "senior", verdict: "success", reason: "Pure schema addition; auto-approved at Senior", details: ["api-contract-checker: no breaking changes", "Coverage delta +1.2% on touched files"], changeRisk: "low", humanOverride: false, hoursAgo: 24 },
  { projectKey: "proj_dw", prRef: "PR-93", prTitle: "Initial schema for v2 warehouse", prHeadSha: "9c3b21e", skillKey: "skill_smr", autonomyAtEval: "intern", verdict: "failure", reason: "Manual review required — schema-migration-reviewer demoted to Intern after auth incident", details: ["NOT NULL on existing column without default", "No backfill plan in PR body", "ADR-0014 still in review"], changeRisk: "high", humanOverride: false, hoursAgo: 4 },
  { projectKey: "proj_auth", prRef: "PR-441", prTitle: "Fix session cookie path after migration", prHeadSha: "7b8e4f1", skillKey: "skill_fta", autonomyAtEval: "senior", verdict: "neutral", reason: "Human override — incident-grade fix, expedited", details: ["Test coverage below threshold (76%)", "Manually approved by Jordan Mwangi"], changeRisk: "medium", humanOverride: true, hoursAgo: 6 },
  { projectKey: "proj_pay", prRef: "PR-1290", prTitle: "docs: payment-webhook outbox reference", prHeadSha: "2af9112", skillKey: "skill_du", autonomyAtEval: "principal", verdict: "success", reason: "Docs-only change; doc-updater Principal on this project — auto-eligible", details: ["No code paths touched", "Markdown lint passed"], changeRisk: "low", humanOverride: false, hoursAgo: 0.5 },
  { projectKey: "proj_auth", prRef: "PR-438", prTitle: "Revert v1.8.1 — session-cookie regression", prHeadSha: "f12abc4", skillKey: null, autonomyAtEval: "n/a", verdict: "failure", reason: "Check-run posting failed — GitHub API 502", details: [], changeRisk: "high", humanOverride: false, checkRunError: "GitHub check-runs API returned 502 Bad Gateway after 3 retries", hoursAgo: 96 },
];

type TestRunSpec = {
  projectKey: ProjectSpec["key"];
  suite: string;
  commitSha: string;
  branch: string;
  status: TestRunStatus;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  coverage: number;
  ciRunUrl: string;
  hoursAgo: number;
};

const TEST_RUN_SPECS: TestRunSpec[] = [
  { projectKey: "proj_pay", suite: "payments-api unit + integration", commitSha: "a4f1d0c", branch: "feat/idempotency-keys", status: "passed", total: 412, passed: 412, failed: 0, skipped: 0, durationMs: 184_000, coverage: 0.832, ciRunUrl: "https://github.com/northwind/payments-api/actions/runs/8821", hoursAgo: 22 },
  { projectKey: "proj_auth", suite: "auth-service e2e", commitSha: "7b8e4f1", branch: "fix/session-cookie-path", status: "failed", total: 187, passed: 163, failed: 21, skipped: 3, durationMs: 412_000, coverage: 0.762, ciRunUrl: "https://github.com/northwind/auth/actions/runs/4471", hoursAgo: 6 },
  { projectKey: "proj_dw", suite: "warehouse-v2 schema check", commitSha: "9c3b21e", branch: "design/iceberg-vs-delta", status: "passed", total: 24, passed: 24, failed: 0, skipped: 0, durationMs: 32_000, coverage: 0.91, ciRunUrl: "https://github.com/northwind/dw-v2/actions/runs/118", hoursAgo: 3 },
  { projectKey: "proj_obs", suite: "observability collector smoke", commitSha: "c0ffee0", branch: "main", status: "passed", total: 58, passed: 58, failed: 0, skipped: 0, durationMs: 21_000, coverage: 0.88, ciRunUrl: "https://github.com/northwind/observability/actions/runs/2204", hoursAgo: 12 },
];

type RepoPolicySpec = {
  remoteCanonical: string;
  policy: RepoPolicy;
  projectKey: ProjectSpec["key"] | null;
};

const REPO_POLICY_SPECS: RepoPolicySpec[] = [
  { remoteCanonical: "github.com/northwind/payments-api", policy: "read-write", projectKey: "proj_pay" },
  { remoteCanonical: "github.com/northwind/dw-v2", policy: "read-only", projectKey: "proj_dw" },
  // Unmapped repo set to deny so the demo shows the gate's "unknown remote" path.
  { remoteCanonical: "github.com/northwind/legacy-billing-archive", policy: "deny", projectKey: null },
];

type CustomChoreographySpec = {
  projectKey: ProjectSpec["key"] | null;
  slug: string;
  name: string;
  body: string;
};

const CUSTOM_CHOREOGRAPHY_SPECS: CustomChoreographySpec[] = [
  {
    projectKey: null,
    slug: "pr-rollout-checklist",
    name: "PR rollout checklist",
    body: "# PR rollout checklist\n\nBefore opening a PR, ensure: (1) rollout plan, (2) monitoring plan, (3) rollback plan are in the description. Call `submit_for_approval` once the diff is ready.",
  },
  {
    projectKey: "proj_pay",
    slug: "payments-incident-runbook",
    name: "Payments incident runbook",
    body: "# Payments incident runbook\n\nOn an `incident` Plan kind being authored on this project: (1) call `invoke_skill('postmortem-drafter')`, (2) attach the resulting summary to the Plan body, (3) `submit_for_approval`.",
  },
  {
    projectKey: "proj_auth",
    slug: "shadow-write-cutover",
    name: "Shadow-write cutover playbook",
    body: "# Shadow-write cutover playbook\n\nDuring the Devise → Better-Auth migration: every PR touching `auth/*` should `invoke_skill('schema-migration-reviewer')`, then `invoke_skill('api-contract-checker')`, then `submit_for_approval` if either flagged risks.",
  },
];

// -------------------- IMPLEMENTATION --------------------

export type SeedResult = {
  inserted: boolean;
  counts: {
    projects: number;
    skills: number;
    plans: number;
    rules: number;
    gates: number;
    approvals: number;
    deployments: number;
    metrics: number;
    skillOutcomes: number;
    autonomyRows: number;
    bindings: number;
    auditLogs: number;
    workItems: number;
    notifications: number;
    webhookEvents: number;
    gateEvaluations: number;
    promptLogs: number;
    testRuns: number;
    repoPolicies: number;
    customChoreographies: number;
  };
};

export async function seedSampleWorkspace(args: {
  organizationId: string;
  userId: string;
  userName: string;
}): Promise<SeedResult> {
  // Idempotency: skip if the org already has any project.
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.organizationId, args.organizationId))
    .limit(1);
  if (existing.length > 0) {
    return {
      inserted: false,
      counts: {
        projects: 0, skills: 0, plans: 0, rules: 0, gates: 0, approvals: 0,
        deployments: 0, metrics: 0, skillOutcomes: 0, autonomyRows: 0, bindings: 0,
        auditLogs: 0, workItems: 0, notifications: 0,
        webhookEvents: 0, gateEvaluations: 0, promptLogs: 0, testRuns: 0,
        repoPolicies: 0, customChoreographies: 0,
      },
    };
  }

  const now = Date.now();
  const at = (daysAgo: number) => new Date(now - daysAgo * DAY);
  const atHours = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);

  // Map fixture keys → freshly minted nanoids so cross-references work.
  const projectIdByKey = new Map<ProjectSpec["key"], string>();
  for (const p of PROJECT_SPECS) projectIdByKey.set(p.key, nanoid());
  const skillIdByKey = new Map<SkillSpec["key"], string>();
  for (const s of SKILL_SPECS) skillIdByKey.set(s.key, nanoid());

  // 1. Projects
  await db.insert(projects).values(
    PROJECT_SPECS.map((p) => ({
      id: projectIdByKey.get(p.key)!,
      organizationId: args.organizationId,
      name: p.name,
      slug: p.slug,
      description: p.description,
      phase: p.phase,
      status: "active" as const,
      repoUrl: p.repoUrl,
      jiraProjectKey: p.jiraProjectKey,
      adoProjectId: p.adoProjectId ?? null,
      confluenceSpaceKey: p.confluenceSpaceKey ?? null,
      createdById: args.userId,
      createdByName: args.userName,
    })),
  );

  // 2. Rules
  await db.insert(rules).values(
    RULE_SPECS.map((r) => ({
      id: nanoid(),
      organizationId: args.organizationId,
      projectId: r.projectKey ? projectIdByKey.get(r.projectKey) ?? null : null,
      slug: r.slug,
      title: r.title,
      body: r.body,
      phase: r.phase,
      severity: r.severity,
      tags: r.tags,
      enabled: true,
      createdById: args.userId,
    })),
  );

  // 3. Skills
  await db.insert(skills).values(
    SKILL_SPECS.map((s) => ({
      id: skillIdByKey.get(s.key)!,
      organizationId: args.organizationId,
      projectId: null,
      slug: s.slug,
      name: s.name,
      description: s.description,
      body: s.body,
      enabled: true,
      createdById: args.userId,
    })),
  );

  // 4. Skill autonomy — both org-wide (legacy aggregate, read by /skills and
  //    /skills/[id] today) and per-project rows (the "trust is per-project"
  //    story — drives the variation Sam sees on each cockpit).
  await db.insert(skillAutonomy).values([
    // Org-wide aggregate rows
    ...SKILL_SPECS.map((s) => ({
      skillId: skillIdByKey.get(s.key)!,
      projectId: null,
      organizationId: args.organizationId,
      level: s.level,
      levelSetAt: at(s.levelSetDaysAgo),
      lastReviewedAt: at(s.lastReviewedDaysAgo),
      nextReviewAt: new Date(now + s.nextReviewDaysAhead * DAY),
      lastReason: s.lastReason,
    })),
    // Per-project rows
    ...SKILL_PROJECT_AUTONOMY.map((sp) => ({
      skillId: skillIdByKey.get(sp.skillKey)!,
      projectId: projectIdByKey.get(sp.projectKey)!,
      organizationId: args.organizationId,
      level: sp.level,
      levelSetAt: at(sp.levelSetDaysAgo),
      lastReviewedAt: at(Math.max(0, sp.levelSetDaysAgo - 1)),
      nextReviewAt: new Date(now + 14 * DAY),
      lastReason: sp.lastReason,
    })),
  ]);

  // 5. Skill outcomes — spread across 30-day window and distributed across
  //    projects using SKILL_PROJECT_AUTONOMY's `outcomeWeight`. Verdicts are
  //    also weighted by project autonomy: a skill that's Intern on a project
  //    eats most of that skill's rollbacks/incidents on that project; a
  //    Principal-level skill produces mostly clean successes.
  //
  //    Each row carries a Milestone-A `sourceKind` so the demo can show how
  //    deterministic GitHub signal (pr_merge / pr_revert / pr_abandon /
  //    deploy_clean / deploy_incident) feeds the autonomy ledger — and
  //    `prompt_quality_signal` rows from the prompt-quality hook show up
  //    later via PROMPT_LOG_SPECS.
  type OutcomeRow = {
    id: string;
    organizationId: string;
    skillId: string | null;
    projectId: string | null;
    invocationId: string | null;
    verdict: SkillOutcomeVerdict | null;
    severity: SkillOutcomeSeverity | null;
    sourceKind: SkillOutcomeSourceKind | null;
    sourceRef: string | null;
    promptLogId: string | null;
    recordedAt: Date;
  };
  const outcomeRows: OutcomeRow[] = [];
  // Group SKILL_PROJECT_AUTONOMY by skill for distribution.
  const projAutonomyBySkill = new Map<SkillSpec["key"], SkillProjectAutonomy[]>();
  for (const sp of SKILL_PROJECT_AUTONOMY) {
    const arr = projAutonomyBySkill.get(sp.skillKey) ?? [];
    arr.push(sp);
    projAutonomyBySkill.set(sp.skillKey, arr);
  }
  for (const s of SKILL_SPECS) {
    const sid = skillIdByKey.get(s.key)!;
    const minutesWindow = 30 * 24 * 60;
    const skillProjects = projAutonomyBySkill.get(s.key) ?? [];
    if (skillProjects.length === 0) continue;

    // Allocate verdict counts per project by weight. Rollbacks/incidents are
    // skewed toward lower-level projects (where the skill struggles).
    const totalWeight = skillProjects.reduce((acc, sp) => acc + sp.outcomeWeight, 0) || 1;
    // Weight for the "trouble" verdicts is inversely proportional to level.
    const troubleWeight = (sp: SkillProjectAutonomy) => sp.outcomeWeight * (4 - sp.level);
    const totalTrouble = skillProjects.reduce((acc, sp) => acc + troubleWeight(sp), 0) || 1;

    type Slot = { sp: SkillProjectAutonomy; success: number; rolledBack: number; incident: number };
    const slots: Slot[] = skillProjects.map((sp) => ({ sp, success: 0, rolledBack: 0, incident: 0 }));

    // Distribute successes by raw outcomeWeight; truncate then patch remainder onto top-weight slot.
    let remSuccess = s.stats.success;
    for (const slot of slots) {
      const v = Math.floor((slot.sp.outcomeWeight / totalWeight) * s.stats.success);
      slot.success = v;
      remSuccess -= v;
    }
    if (remSuccess > 0 && slots.length > 0) slots[0].success += remSuccess;

    // Distribute rollbacks + incidents by inverse-level weight.
    let remRoll = s.stats.rolledBack;
    let remInc = s.stats.incident;
    for (const slot of slots) {
      const w = troubleWeight(slot.sp);
      const r = Math.floor((w / totalTrouble) * s.stats.rolledBack);
      const i = Math.floor((w / totalTrouble) * s.stats.incident);
      slot.rolledBack = r;
      slot.incident = i;
      remRoll -= r;
      remInc -= i;
    }
    if (slots.length > 0) {
      // Pin remainders on the lowest-level slot (most struggling project).
      const worst = [...slots].sort((a, b) => a.sp.level - b.sp.level)[0];
      worst.rolledBack += Math.max(0, remRoll);
      worst.incident += Math.max(0, remInc);
    }

    const totalForSkill = s.stats.success + s.stats.rolledBack + s.stats.incident;
    const step = totalForSkill > 0 ? minutesWindow / totalForSkill : 0;
    let i = 0;
    let refSeq = 0;
    const push = (
      projectId: string | null,
      verdict: SkillOutcomeVerdict,
      severity: SkillOutcomeSeverity | null,
      sourceKind: SkillOutcomeSourceKind,
      count: number,
    ) => {
      for (let k = 0; k < count; k++) {
        const minsAgo = Math.round(step * (totalForSkill - i) + (Math.random() * step * 0.3));
        i += 1;
        refSeq += 1;
        // sourceRef is unique per (skill_id, source_kind, source_ref) — the
        // partial unique index in the schema enforces this for non-invocation
        // rows. A monotonic per-skill counter prefixed by the assessor is
        // realistic (one row per merged PR / per rolled-back deploy) and
        // collision-free.
        const sourceRef =
          sourceKind === "pr_merge"
            ? `PR-merge-${s.key}-${refSeq}`
            : sourceKind === "pr_revert"
              ? `PR-revert-${s.key}-${refSeq}`
              : sourceKind === "pr_abandon"
                ? `PR-abandon-${s.key}-${refSeq}`
                : sourceKind === "deploy_clean"
                  ? `deploy-clean-${s.key}-${refSeq}`
                  : sourceKind === "deploy_incident"
                    ? `deploy-incident-${s.key}-${refSeq}`
                    : `inv-${s.key}-${refSeq}`;
        outcomeRows.push({
          id: nanoid(),
          organizationId: args.organizationId,
          skillId: sid,
          projectId,
          invocationId: null,
          verdict,
          severity,
          sourceKind,
          sourceRef,
          promptLogId: null,
          recordedAt: new Date(now - minsAgo * 60_000),
        });
      }
    };
    for (const slot of slots) {
      const pid = projectIdByKey.get(slot.sp.projectKey)!;
      // Successes are dominated by clean PR merges — that's the Milestone-A
      // signal the autonomy engine prizes. Reserve ~15% for `deploy_clean`
      // so the demo also shows post-deploy verification credit.
      const successDeploy = Math.floor(slot.success * 0.15);
      const successMerge = slot.success - successDeploy;
      push(pid, "success", null, "pr_merge", successMerge);
      push(pid, "success", null, "deploy_clean", successDeploy);

      // Rollbacks come from revert PRs (most) and a small share of
      // pr_abandon (PRs the gate auto-closed without merging).
      const rollAbandon = Math.floor(slot.rolledBack * 0.25);
      const rollRevert = slot.rolledBack - rollAbandon;
      push(pid, "rolled_back", "low", "pr_revert", rollRevert);
      push(pid, "rolled_back", "low", "pr_abandon", rollAbandon);

      // Incidents are deploy-time signal.
      push(pid, "incident", "high", "deploy_incident", slot.incident);
    }
  }
  // Batch insert — Postgres bind limit ≈ 65k params; ~340 rows × 7 cols = ~2.4k. Safe.
  if (outcomeRows.length > 0) await db.insert(skillOutcomes).values(outcomeRows);

  // 5b. Adapter bindings — what external systems each project is wired to.
  if (BINDING_SPECS.length > 0) {
    await db.insert(adapterBindings).values(
      BINDING_SPECS.map((b) => ({
        id: nanoid(),
        organizationId: args.organizationId,
        projectId: projectIdByKey.get(b.projectKey)!,
        provider: b.provider,
        externalKey: b.externalKey,
        config: null,
      })),
    );
  }

  // 6. Plans — record IDs so approvals/deployments can reference.
  const planIdByTitle = new Map<string, string>();
  await db.insert(plans).values(
    PLAN_SPECS.map((p) => {
      const id = nanoid();
      planIdByTitle.set(p.title, id);
      return {
        id,
        organizationId: args.organizationId,
        projectId: projectIdByKey.get(p.projectKey)!,
        kind: p.kind,
        title: p.title,
        summary: p.summary,
        body: `# ${p.title}\n\n${p.summary}\n`,
        status: p.status,
        priority: p.priority,
        assigneeName: p.assigneeName,
        externalRef: p.externalRef,
        updatedAt: at(p.daysAgoUpdated),
        createdById: args.userId,
        createdByName: args.userName,
      };
    }),
  );

  // 7. Phase gates
  await db.insert(phaseGates).values(
    GATE_SPECS.map((g) => ({
      id: nanoid(),
      organizationId: args.organizationId,
      projectId: projectIdByKey.get(g.projectKey)!,
      phase: g.phase,
      name: g.name,
      description: g.description,
      type: g.type,
      status: g.status,
      unmetCriterion: g.unmetCriterion ?? null,
      assigneeName: g.assigneeName ?? null,
      lastChangedAt: at(g.daysAgoChanged),
      lastGreenAt: g.status === "passed" ? at(g.daysAgoChanged) : null,
      evaluatedAt: at(g.daysAgoChanged),
    })),
  );

  // 8. Approvals
  await db.insert(approvals).values(
    APPROVAL_SPECS.map((a) => ({
      id: nanoid(),
      organizationId: args.organizationId,
      entityType: a.entityType,
      entityId: a.entityId,
      phase: a.phase,
      requestedById: args.userId,
      requestedByName: a.requestedByName,
      status: "pending" as const,
      createdAt: atHours(a.hoursAgo),
      updatedAt: atHours(a.hoursAgo),
    })),
  );

  // 9. Deployments
  await db.insert(deployments).values(
    DEPLOYMENT_SPECS.map((d) => ({
      id: nanoid(),
      organizationId: args.organizationId,
      projectId: projectIdByKey.get(d.projectKey)!,
      planId: null,
      environment: d.environment,
      version: d.version,
      status: d.status,
      deployedByName: d.deployedByName ?? null,
      startedAt: at(d.daysAgo),
      completedAt: d.status === "in_progress" || d.status === "pending" ? null : at(d.daysAgo - 0.02),
      rolledBackAt: d.status === "rolled_back" ? at(d.daysAgo - 0.05) : null,
      rolledBackReason: d.rolledBackReason ?? null,
    })),
  );

  // 10. Metrics — current snapshot rows + 12 weekly samples for trend
  const metricRows: Array<typeof metrics.$inferInsert> = [];
  for (const m of DORA_METRICS) {
    const projectId = projectIdByKey.get(m.projectKey)!;
    // Current value (today)
    metricRows.push({
      id: nanoid(),
      organizationId: args.organizationId,
      projectId,
      type: m.type,
      value: m.value,
      unit: m.unit,
      recordedAt: at(0),
    });
    // 12 weekly samples, varying ±15% with the regression bias for auth CFR
    for (let week = 1; week <= 12; week++) {
      const driftBase = m.projectKey === "proj_auth" && m.type === "change_failure_rate" ? 0.08 : m.value;
      const driftTarget = m.value;
      const lerp = (week - 1) / 11;
      const base = driftBase + (driftTarget - driftBase) * (1 - lerp);
      const jitter = (Math.random() - 0.5) * 0.2 * Math.abs(base);
      metricRows.push({
        id: nanoid(),
        organizationId: args.organizationId,
        projectId,
        type: m.type,
        value: Math.max(0, base + jitter),
        unit: m.unit,
        recordedAt: at(week * 7),
      });
    }
  }
  if (metricRows.length > 0) await db.insert(metrics).values(metricRows);

  // 11. Audit logs — autonomy events + a few approvals/deployments for narrative
  const auditRows: Array<typeof auditLogs.$inferInsert> = [];
  for (const ev of AUTONOMY_EVENTS) {
    const skillSpec = SKILL_SPECS.find((s) => s.key === ev.skillKey)!;
    auditRows.push({
      id: nanoid(),
      organizationId: args.organizationId,
      actorType: "system",
      actorId: null,
      actorName: "autonomy-engine",
      action: ev.action,
      entityType: "skill_autonomy",
      entityId: skillIdByKey.get(ev.skillKey)!,
      summary: `${skillSpec.name} — ${ev.summary}`,
      createdAt: at(ev.daysAgo),
    });
  }
  // Project phase advances
  auditRows.push({
    id: nanoid(),
    organizationId: args.organizationId,
    actorType: "user",
    actorId: args.userId,
    actorName: args.userName,
    action: "phase_gate.advance",
    entityType: "phase_gate",
    entityId: projectIdByKey.get("proj_pay")!,
    summary: "internal-payments-api: design → development",
    createdAt: at(11),
  });
  auditRows.push({
    id: nanoid(),
    organizationId: args.organizationId,
    actorType: "user",
    actorId: args.userId,
    actorName: args.userName,
    action: "plan.status",
    entityType: "plan",
    entityId: planIdByTitle.get("Outbox pattern for payment webhooks") ?? "plan_pay_a1",
    summary: "Outbox pattern for payment webhooks — in_review → approved",
    createdAt: at(9),
  });
  auditRows.push({
    id: nanoid(),
    organizationId: args.organizationId,
    actorType: "integration",
    actorId: null,
    actorName: "github-actions",
    action: "deployment.event",
    entityType: "deployment",
    entityId: "auth-1.8.1",
    summary: "auth-service-migration v1.8.1 → production — rolled_back (session cookie mismatch)",
    createdAt: at(4),
  });

  await db.insert(auditLogs).values(auditRows);

  // 12. Work items — what coznt has synced from GitHub / Jira / Confluence
  await db.insert(workItems).values(
    WORK_ITEM_SPECS.map((w) => ({
      id: nanoid(),
      organizationId: args.organizationId,
      projectId: projectIdByKey.get(w.projectKey)!,
      planId: null,
      source: w.source,
      externalId: w.externalId,
      externalUrl: w.externalUrl,
      kind: w.kind,
      title: w.title,
      status: w.status,
      assigneeEmail: w.assigneeEmail,
      lastSyncedAt: at(w.daysAgoUpdated),
      createdAt: at(w.daysAgoUpdated + 1),
      updatedAt: at(w.daysAgoUpdated),
    })),
  );

  // 14. Prompt logs — what the prompt-quality hook captured on the IDE side.
  //     Each row may carry a quality score; sub-GOOD scores generate a
  //     companion `prompt_quality_signal` skill_outcome (project-level, no
  //     skillId) that downstreams autonomy promotion attenuation.
  const promptLogIds: string[] = [];
  if (PROMPT_LOG_SPECS.length > 0) {
    const promptRows = PROMPT_LOG_SPECS.map((p) => {
      const id = nanoid();
      promptLogIds.push(id);
      return {
        id,
        organizationId: args.organizationId,
        projectId: projectIdByKey.get(p.projectKey)!,
        mcpSessionId: `mcp_${nanoid(8)}`,
        role: "USER" as const,
        source: p.source,
        content: p.content,
        phase: p.phase,
        authorName: p.authorName,
        authorEmail: p.authorEmail,
        clientLocalId: nanoid(10),
        promptScore: p.promptScore,
        promptTier: p.promptTier,
        promptScoreDetail: { signals: [`tier=${p.promptTier}`, `score=${p.promptScore}`] },
        rubricVersion: "v0.3",
        scoredAt: atHours(p.hoursAgo),
        createdAt: atHours(p.hoursAgo),
      };
    });
    await db.insert(promptLogs).values(promptRows);

    // For every NEEDS_IMPROVEMENT / POOR row, emit a project-level
    // prompt_quality_signal outcome — no skillId, no verdict, no severity.
    const signalRows: OutcomeRow[] = [];
    for (let idx = 0; idx < PROMPT_LOG_SPECS.length; idx++) {
      const p = PROMPT_LOG_SPECS[idx];
      if (p.promptTier === "GOOD") continue;
      signalRows.push({
        id: nanoid(),
        organizationId: args.organizationId,
        skillId: null,
        projectId: projectIdByKey.get(p.projectKey)!,
        invocationId: null,
        verdict: null,
        severity: null,
        sourceKind: "prompt_quality_signal",
        sourceRef: promptLogIds[idx],
        promptLogId: promptLogIds[idx],
        recordedAt: atHours(p.hoursAgo),
      });
    }
    if (signalRows.length > 0) await db.insert(skillOutcomes).values(signalRows);
  }

  // 15. Webhook events — inbound deliveries, idempotent on (source, externalId)
  if (WEBHOOK_EVENT_SPECS.length > 0) {
    await db.insert(webhookEvents).values(
      WEBHOOK_EVENT_SPECS.map((w) => ({
        id: nanoid(),
        organizationId: args.organizationId,
        source: w.source,
        externalId: w.externalId,
        event: w.event,
        payload: { summary: w.payloadSummary } as Record<string, unknown>,
        receivedAt: atHours(w.hoursAgo),
        processedAt: w.processed ? atHours(Math.max(0, w.hoursAgo - 0.05)) : null,
        processingError: w.processingError ?? null,
      })),
    );
  }

  // 16. Gate evaluations — per-PR execution-gate decisions
  if (GATE_EVALUATION_SPECS.length > 0) {
    await db.insert(gateEvaluations).values(
      GATE_EVALUATION_SPECS.map((g) => ({
        id: nanoid(),
        organizationId: args.organizationId,
        projectId: projectIdByKey.get(g.projectKey)!,
        prRef: g.prRef,
        prTitle: g.prTitle,
        prHeadSha: g.prHeadSha,
        skillId: g.skillKey ? skillIdByKey.get(g.skillKey)! : null,
        autonomyAtEval: g.autonomyAtEval,
        verdict: g.verdict,
        reason: g.reason,
        details: g.details,
        changeRisk: g.changeRisk,
        humanOverride: g.humanOverride,
        checkRunId: g.checkRunError ? null : `check-${nanoid(6)}`,
        checkRunError: g.checkRunError ?? null,
        evaluatedAt: atHours(g.hoursAgo),
      })),
    );
  }

  // 17. Test runs
  if (TEST_RUN_SPECS.length > 0) {
    await db.insert(testRuns).values(
      TEST_RUN_SPECS.map((t) => ({
        id: nanoid(),
        organizationId: args.organizationId,
        projectId: projectIdByKey.get(t.projectKey)!,
        planId: null,
        suite: t.suite,
        commitSha: t.commitSha,
        branch: t.branch,
        status: t.status,
        total: t.total,
        passed: t.passed,
        failed: t.failed,
        skipped: t.skipped,
        durationMs: t.durationMs,
        coverage: t.coverage,
        ciRunUrl: t.ciRunUrl,
        raw: null,
        ranAt: atHours(t.hoursAgo),
      })),
    );
  }

  // 18. Repo policies — what `coznt push` does when an agent points at a remote
  if (REPO_POLICY_SPECS.length > 0) {
    await db.insert(repoPolicies).values(
      REPO_POLICY_SPECS.map((r) => ({
        id: nanoid(),
        organizationId: args.organizationId,
        remoteCanonical: r.remoteCanonical,
        policy: r.policy,
        projectId: r.projectKey ? projectIdByKey.get(r.projectKey)! : null,
        createdById: args.userId,
        createdByName: args.userName,
      })),
    );
  }

  // 19. Custom choreographies — customer-authored workflow playbooks
  if (CUSTOM_CHOREOGRAPHY_SPECS.length > 0) {
    await db.insert(customChoreographies).values(
      CUSTOM_CHOREOGRAPHY_SPECS.map((c) => ({
        id: nanoid(),
        organizationId: args.organizationId,
        projectId: c.projectKey ? projectIdByKey.get(c.projectKey)! : null,
        slug: c.slug,
        name: c.name,
        body: c.body,
        version: "1.0.0",
        enabled: true,
        createdById: args.userId,
        createdByName: args.userName,
      })),
    );
  }

  // 13. Notifications — seeded so the bell icon actually rings on demo
  await db.insert(notifications).values(
    NOTIFICATION_SPECS.map((n) => ({
      id: nanoid(),
      organizationId: args.organizationId,
      recipientId: args.userId,
      channel: "in_app" as const,
      subject: n.subject,
      body: n.body,
      link: n.link,
      entityType: n.entityType,
      entityId: null,
      read: n.read,
      readAt: n.read ? atHours(n.hoursAgo - 1) : null,
      sentAt: atHours(n.hoursAgo),
      createdAt: atHours(n.hoursAgo),
    })),
  );

  // Count the prompt_quality_signal outcomes we appended above (one per
  // sub-GOOD prompt log) so the seed report includes them in skillOutcomes.
  const promptSignalCount = PROMPT_LOG_SPECS.filter((p) => p.promptTier !== "GOOD").length;

  return {
    inserted: true,
    counts: {
      projects: PROJECT_SPECS.length,
      skills: SKILL_SPECS.length,
      plans: PLAN_SPECS.length,
      rules: RULE_SPECS.length,
      gates: GATE_SPECS.length,
      approvals: APPROVAL_SPECS.length,
      deployments: DEPLOYMENT_SPECS.length,
      metrics: metricRows.length,
      skillOutcomes: outcomeRows.length + promptSignalCount,
      autonomyRows: SKILL_SPECS.length + SKILL_PROJECT_AUTONOMY.length,
      bindings: BINDING_SPECS.length,
      auditLogs: auditRows.length,
      workItems: WORK_ITEM_SPECS.length,
      notifications: NOTIFICATION_SPECS.length,
      webhookEvents: WEBHOOK_EVENT_SPECS.length,
      gateEvaluations: GATE_EVALUATION_SPECS.length,
      promptLogs: PROMPT_LOG_SPECS.length,
      testRuns: TEST_RUN_SPECS.length,
      repoPolicies: REPO_POLICY_SPECS.length,
      customChoreographies: CUSTOM_CHOREOGRAPHY_SPECS.length,
    },
  };
}
