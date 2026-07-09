/**
 * Pure-function tests for the Milestone A outcome assessors.
 *
 * Mirrors the table-driven style of `tests/execution-gate.test.ts`. Each
 * assessor has a happy path, the deferral case (returns `verdict: null`),
 * and the explicit anti-cases (e.g. revert outside window, sub-threshold
 * abandonment) where the assessor must NOT emit an outcome.
 */

import { describe, expect, it } from "vitest";

import {
  type AssessorResult,
  DEPLOY_INCIDENT_WINDOW_MS,
  PR_ABANDON_THRESHOLD_MS,
  PR_REVERT_WINDOW_MS,
  assessDeployClean,
  assessDeployIncident,
  assessPrAbandoned,
  assessPrMerged,
  assessPrReverted,
} from "@/domain/outcomes";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const NOW = new Date("2026-05-14T12:00:00Z");
const eightDaysAgo = new Date(NOW.getTime() - 8 * DAY);
const threeDaysAgo = new Date(NOW.getTime() - 3 * DAY);
const tenHoursAgo = new Date(NOW.getTime() - 10 * HOUR);
const thirtyHoursAgo = new Date(NOW.getTime() - 30 * HOUR);
const fortyEightHoursAgo = new Date(NOW.getTime() - 48 * HOUR);

function mergedPr(overrides: { mergedAt: Date }) {
  return {
    merged: true,
    mergedAt: overrides.mergedAt,
    closed: true,
    closedAt: overrides.mergedAt,
    createdAt: new Date(overrides.mergedAt.getTime() - 2 * HOUR),
  };
}

function closedPr(overrides: { createdAt: Date; closedAt: Date; merged?: boolean }) {
  return {
    merged: overrides.merged ?? false,
    mergedAt: overrides.merged ? overrides.closedAt : null,
    closed: true,
    closedAt: overrides.closedAt,
    createdAt: overrides.createdAt,
  };
}

function expectVerdict(r: AssessorResult, verdict: AssessorResult["verdict"]) {
  expect(r.verdict).toBe(verdict);
}

// ---------------------------------------------------------------------------
// assessPrMerged
// ---------------------------------------------------------------------------

describe("assessPrMerged", () => {
  it("returns success when merged >7d ago with green checks and no revert", () => {
    const r = assessPrMerged(
      mergedPr({ mergedAt: eightDaysAgo }),
      { reverted: false, requiredChecksGreen: true },
      { now: NOW },
    );
    expectVerdict(r, "success");
    expect(r.severity).toBeNull();
  });

  it("defers (null) when the observation window is still open", () => {
    const r = assessPrMerged(
      mergedPr({ mergedAt: threeDaysAgo }),
      { reverted: false, requiredChecksGreen: true },
      { now: NOW },
    );
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/observation window/);
  });

  it("defers when a revert has been seen — assessPrReverted owns that case", () => {
    const r = assessPrMerged(
      mergedPr({ mergedAt: eightDaysAgo }),
      { reverted: true, requiredChecksGreen: true },
      { now: NOW },
    );
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/assessPrReverted/);
  });

  it("defers when required checks are not green", () => {
    const r = assessPrMerged(
      mergedPr({ mergedAt: eightDaysAgo }),
      { reverted: false, requiredChecksGreen: false },
      { now: NOW },
    );
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/checks are not green/);
  });

  it("defers when check state is unknown (null) — does not assume green", () => {
    const r = assessPrMerged(
      mergedPr({ mergedAt: eightDaysAgo }),
      { reverted: false, requiredChecksGreen: null },
      { now: NOW },
    );
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/unknown/);
  });

  it("defers when the pr never merged", () => {
    const r = assessPrMerged(
      closedPr({ createdAt: fortyEightHoursAgo, closedAt: tenHoursAgo, merged: false }),
      { reverted: false, requiredChecksGreen: true },
      { now: NOW },
    );
    expectVerdict(r, null);
  });

  it("respects a custom windowMs override", () => {
    // 30h-old merge would normally defer; override window to 24h and it succeeds.
    const r = assessPrMerged(
      mergedPr({ mergedAt: thirtyHoursAgo }),
      { reverted: false, requiredChecksGreen: true },
      { now: NOW, windowMs: 24 * HOUR },
    );
    expectVerdict(r, "success");
  });
});

// ---------------------------------------------------------------------------
// assessPrAbandoned
// ---------------------------------------------------------------------------

describe("assessPrAbandoned", () => {
  it("returns rolled_back/low when closed unmerged after >24h open", () => {
    const r = assessPrAbandoned(
      closedPr({ createdAt: fortyEightHoursAgo, closedAt: tenHoursAgo }),
      { now: NOW },
    );
    expectVerdict(r, "rolled_back");
    expect(r.severity).toBe("low");
  });

  it("defers if the pr was merged", () => {
    const r = assessPrAbandoned(
      closedPr({ createdAt: fortyEightHoursAgo, closedAt: tenHoursAgo, merged: true }),
      { now: NOW },
    );
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/not abandoned/);
  });

  it("defers if the pr is still open", () => {
    const r = assessPrAbandoned({
      merged: false,
      mergedAt: null,
      closed: false,
      closedAt: null,
      createdAt: fortyEightHoursAgo,
    });
    expectVerdict(r, null);
  });

  it("defers if the pr was closed under the 24h threshold", () => {
    const r = assessPrAbandoned(
      closedPr({
        createdAt: new Date(NOW.getTime() - 5 * HOUR),
        closedAt: NOW,
      }),
      { now: NOW },
    );
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/abandonment threshold/);
  });

  it("uses the PR_ABANDON_THRESHOLD_MS default of 24h", () => {
    expect(PR_ABANDON_THRESHOLD_MS).toBe(24 * HOUR);
  });
});

// ---------------------------------------------------------------------------
// assessPrReverted
// ---------------------------------------------------------------------------

describe("assessPrReverted", () => {
  it("returns rolled_back/high when reverted inside the 7d window", () => {
    const mergedAt = new Date(NOW.getTime() - 3 * DAY);
    const revertAt = new Date(NOW.getTime() - 1 * DAY);
    const r = assessPrReverted(
      mergedPr({ mergedAt }),
      { committedAt: revertAt, sha: "deadbeefcafe1234" },
      { now: NOW },
    );
    expectVerdict(r, "rolled_back");
    expect(r.severity).toBe("high");
    expect(r.rationale).toMatch(/deadbeefcafe/);
  });

  it("defers when revert lands outside the 7d window", () => {
    const mergedAt = new Date(NOW.getTime() - 30 * DAY);
    const revertAt = new Date(NOW.getTime() - 20 * DAY);
    const r = assessPrReverted(mergedPr({ mergedAt }), { committedAt: revertAt }, { now: NOW });
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/outside/);
  });

  it("defers when the pr never merged", () => {
    const r = assessPrReverted(
      closedPr({ createdAt: fortyEightHoursAgo, closedAt: tenHoursAgo, merged: false }),
      { committedAt: tenHoursAgo },
      { now: NOW },
    );
    expectVerdict(r, null);
  });

  it("defers when revert predates the merge (misattribution)", () => {
    const mergedAt = new Date(NOW.getTime() - 1 * DAY);
    const revertAt = new Date(NOW.getTime() - 3 * DAY);
    const r = assessPrReverted(mergedPr({ mergedAt }), { committedAt: revertAt }, { now: NOW });
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/predates/);
  });

  it("uses the PR_REVERT_WINDOW_MS default of 7d", () => {
    expect(PR_REVERT_WINDOW_MS).toBe(7 * DAY);
  });
});

// ---------------------------------------------------------------------------
// assessDeployClean
// ---------------------------------------------------------------------------

describe("assessDeployClean", () => {
  function successDeploy(completedAt: Date, environment = "production") {
    return {
      status: "success" as const,
      environment,
      completedAt,
      rolledBackAt: null,
    };
  }

  it("returns success when prod deploy is >24h clean with no incident", () => {
    const r = assessDeployClean(
      successDeploy(fortyEightHoursAgo),
      { firstIncidentAt: null },
      { now: NOW },
    );
    expectVerdict(r, "success");
  });

  it("defers when still within the 24h observation window", () => {
    const r = assessDeployClean(
      successDeploy(tenHoursAgo),
      { firstIncidentAt: null },
      { now: NOW },
    );
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/observation window/);
  });

  it("defers when an incident landed inside the window", () => {
    const completedAt = fortyEightHoursAgo;
    const incidentAt = new Date(completedAt.getTime() + 6 * HOUR);
    const r = assessDeployClean(
      successDeploy(completedAt),
      { firstIncidentAt: incidentAt },
      { now: NOW },
    );
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/assessDeployIncident/);
  });

  it("succeeds when an incident landed AFTER the 24h window — the deploy was clean", () => {
    const completedAt = new Date(NOW.getTime() - 5 * DAY);
    const lateIncidentAt = new Date(completedAt.getTime() + 3 * DAY);
    const r = assessDeployClean(
      successDeploy(completedAt),
      { firstIncidentAt: lateIncidentAt },
      { now: NOW },
    );
    expectVerdict(r, "success");
  });

  it("defers when deploy status is not success", () => {
    const r = assessDeployClean(
      { status: "failed", environment: "production", completedAt: fortyEightHoursAgo, rolledBackAt: null },
      { firstIncidentAt: null },
      { now: NOW },
    );
    expectVerdict(r, null);
  });

  it("uses the DEPLOY_INCIDENT_WINDOW_MS default of 24h", () => {
    expect(DEPLOY_INCIDENT_WINDOW_MS).toBe(24 * HOUR);
  });
});

// ---------------------------------------------------------------------------
// assessDeployIncident
// ---------------------------------------------------------------------------

describe("assessDeployIncident", () => {
  it("returns incident/critical when a prod deploy is explicitly rolled back", () => {
    const r = assessDeployIncident(
      {
        status: "rolled_back",
        environment: "production",
        completedAt: tenHoursAgo,
        rolledBackAt: NOW,
      },
      null,
    );
    expectVerdict(r, "incident");
    expect(r.severity).toBe("critical");
  });

  it("returns incident/high for a non-prod rollback (staging)", () => {
    const r = assessDeployIncident(
      {
        status: "rolled_back",
        environment: "staging",
        completedAt: tenHoursAgo,
        rolledBackAt: NOW,
      },
      null,
    );
    expectVerdict(r, "incident");
    expect(r.severity).toBe("high");
  });

  it("treats a failed deploy as an incident at the env-appropriate severity", () => {
    const r = assessDeployIncident(
      {
        status: "failed",
        environment: "production",
        completedAt: tenHoursAgo,
        rolledBackAt: null,
      },
      null,
    );
    expectVerdict(r, "incident");
    expect(r.severity).toBe("critical");
  });

  it("returns incident when a linked incident lands inside the 24h window", () => {
    const completedAt = new Date(NOW.getTime() - 8 * HOUR);
    const incidentAt = new Date(completedAt.getTime() + 3 * HOUR);
    const r = assessDeployIncident(
      {
        status: "success",
        environment: "production",
        completedAt,
        rolledBackAt: null,
      },
      { occurredAt: incidentAt, summary: "p1 paging volume spike" },
    );
    expectVerdict(r, "incident");
    expect(r.severity).toBe("critical");
    expect(r.rationale).toMatch(/paging volume/);
  });

  it("defers when the incident landed after the window — not attributable", () => {
    const completedAt = new Date(NOW.getTime() - 3 * DAY);
    const incidentAt = new Date(completedAt.getTime() + 2 * DAY);
    const r = assessDeployIncident(
      {
        status: "success",
        environment: "production",
        completedAt,
        rolledBackAt: null,
      },
      { occurredAt: incidentAt },
    );
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/outside/);
  });

  it("defers when an incident predates the deploy (clock skew / misattribution)", () => {
    const completedAt = new Date(NOW.getTime() - 2 * HOUR);
    const earlierIncident = new Date(completedAt.getTime() - 1 * HOUR);
    const r = assessDeployIncident(
      {
        status: "success",
        environment: "production",
        completedAt,
        rolledBackAt: null,
      },
      { occurredAt: earlierIncident },
    );
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/predates/);
  });

  it("defers when deploy succeeded and no incident is linked", () => {
    const r = assessDeployIncident(
      {
        status: "success",
        environment: "production",
        completedAt: tenHoursAgo,
        rolledBackAt: null,
      },
      null,
    );
    expectVerdict(r, null);
    expect(r.rationale).toMatch(/no incident/);
  });

  it("honours a custom production-environment set", () => {
    const r = assessDeployIncident(
      {
        status: "rolled_back",
        environment: "live",
        completedAt: tenHoursAgo,
        rolledBackAt: NOW,
      },
      null,
      { productionEnvironments: new Set(["live"]) },
    );
    expectVerdict(r, "incident");
    expect(r.severity).toBe("critical");
  });
});
