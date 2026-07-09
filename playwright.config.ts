import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "helpers/**",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  workers: 1,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3029",
    channel: "chrome",
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    launchOptions: {
      slowMo: 600,
    },
  },
  reporter: "list",
  projects: [
    // ── Auth ──────────────────────────────────────────────────────
    {
      name: "auth",
      testMatch: "auth.setup.ts",
    },
    {
      name: "portal-auth",
      testMatch: "auth.portal.setup.ts",
      dependencies: ["auth"],
    },

    // ── Team Track ───────────────────────────────────────────────
    // Sequential chain: each step produces data for the next.
    {
      name: "team-01-role",
      testMatch: "tests/team-track/01-create-role.spec.ts",
      use: { storageState: "e2e/.auth/admin.json" },
      dependencies: ["auth"],
    },
    {
      name: "team-02-source",
      testMatch: "tests/team-track/02-source-candidates.spec.ts",
      use: { storageState: "e2e/.auth/admin.json" },
      dependencies: ["team-01-role"],
    },
    {
      name: "team-03-pipeline",
      testMatch: "tests/team-track/03-pipeline-triage.spec.ts",
      use: { storageState: "e2e/.auth/admin.json" },
      dependencies: ["team-02-source"],
    },
    {
      name: "team-04-interview",
      testMatch: "tests/team-track/04-interview.spec.ts",
      use: { storageState: "e2e/.auth/admin.json" },
      dependencies: ["team-03-pipeline"],
    },
    {
      name: "team-05-assessment",
      testMatch: "tests/team-track/05-assessment.spec.ts",
      use: { storageState: "e2e/.auth/admin.json" },
      dependencies: ["team-03-pipeline"],
    },
    {
      name: "team-06-offer",
      testMatch: "tests/team-track/06-offer.spec.ts",
      use: { storageState: "e2e/.auth/admin.json" },
      dependencies: ["team-04-interview"],
    },
    {
      name: "team-08-visibility",
      testMatch: "tests/team-track/08-public-visibility.spec.ts",
      use: { storageState: "e2e/.auth/admin.json" },
      dependencies: ["team-01-role"],
    },
    {
      name: "team-07-close",
      testMatch: "tests/team-track/07-close-analytics.spec.ts",
      use: { storageState: "e2e/.auth/admin.json" },
      dependencies: ["team-06-offer"],
    },

    // ── Candidate Track ──────────────────────────────────────────
    // Portal tests — each depends on team track creating data first.
    {
      name: "candidate-01-nav",
      testMatch: "tests/candidate-track/01-portal-navigation.spec.ts",
      use: { storageState: "e2e/.auth/portal.json" },
      dependencies: ["portal-auth", "team-03-pipeline"],
    },
    {
      name: "candidate-02-profile",
      testMatch: "tests/candidate-track/02-profile.spec.ts",
      use: { storageState: "e2e/.auth/portal.json" },
      dependencies: ["candidate-01-nav"],
    },
    {
      name: "candidate-03-roles",
      testMatch: "tests/candidate-track/03-roles-discovery.spec.ts",
      use: { storageState: "e2e/.auth/portal.json" },
      dependencies: ["candidate-01-nav"],
    },
    {
      name: "candidate-04-prep",
      testMatch: "tests/candidate-track/04-interview-prep.spec.ts",
      use: { storageState: "e2e/.auth/portal.json" },
      dependencies: ["portal-auth", "team-04-interview"],
    },
    {
      name: "candidate-05-join",
      testMatch: "tests/candidate-track/05-interview-join.spec.ts",
      use: { storageState: "e2e/.auth/portal.json" },
      dependencies: ["portal-auth", "team-04-interview"],
    },
    {
      name: "candidate-06-assessment",
      testMatch: "tests/candidate-track/06-assessment.spec.ts",
      use: { storageState: "e2e/.auth/portal.json" },
      dependencies: ["portal-auth", "team-05-assessment"],
    },
    {
      name: "candidate-07-offer",
      testMatch: "tests/candidate-track/07-offer-response.spec.ts",
      use: { storageState: "e2e/.auth/portal.json" },
      dependencies: ["portal-auth", "team-06-offer"],
    },
    {
      name: "candidate-08-settings",
      testMatch: "tests/candidate-track/08-settings.spec.ts",
      use: { storageState: "e2e/.auth/portal.json" },
      dependencies: ["candidate-01-nav"],
    },
    {
      name: "candidate-09-public",
      testMatch: "tests/candidate-track/09-public-funnel.spec.ts",
      // Intentionally no storageState — exercises the anonymous flow.
      dependencies: [],
    },

    // ── Vendor Track ─────────────────────────────────────────────
    // Self-contained: invites a vendor, signs them up, and walks the
    // visibility / pause / resume paths in one serial spec.
    {
      name: "vendor-01-flow",
      testMatch: "tests/vendor-track/01-vendor-flow.spec.ts",
      use: { storageState: "e2e/.auth/admin.json" },
      dependencies: ["auth"],
    },
    {
      name: "vendor-02-referral",
      testMatch: "tests/vendor-track/02-referral-abuse.spec.ts",
      use: { storageState: "e2e/.auth/admin.json" },
      dependencies: ["vendor-01-flow"],
    },

    // ── Cross-Cutting ────────────────────────────────────────────
    {
      name: "smoke",
      testMatch: "tests/cross-cutting/production-readiness.spec.ts",
      use: { storageState: "e2e/.auth/admin.json" },
      dependencies: ["auth"],
    },
    {
      name: "cross-cutting",
      testMatch: [
        "tests/cross-cutting/command-palette.spec.ts",
        "tests/cross-cutting/panel-synthesis.spec.ts",
        "tests/cross-cutting/livekit-features.spec.ts",
        "tests/cross-cutting/in-interview-assessments.spec.ts",
        "tests/cross-cutting/org-settings.spec.ts",
        "tests/cross-cutting/multi-tenant.spec.ts",
      ],
      use: { storageState: "e2e/.auth/admin.json" },
      dependencies: ["team-03-pipeline"],
    },
    // CSRF + race + rate-limit specs are intentionally unauthenticated
    // (they hit the public surfaces). No storageState; no dependencies.
    {
      name: "cross-csrf",
      testMatch: "tests/cross-cutting/csrf-claim-routes.spec.ts",
    },
    {
      name: "cross-referral-race",
      testMatch: "tests/cross-cutting/referral-race.spec.ts",
    },
    {
      name: "cross-rate-limit",
      testMatch: "tests/cross-cutting/rate-limit.spec.ts",
    },
  ],
});
