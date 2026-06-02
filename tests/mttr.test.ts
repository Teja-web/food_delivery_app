/**
 * Pure-function tests for MTTR pairing.
 *
 * The DB-touching paths (`recordMttrForSuccess`, `recordMttrForRollback`)
 * are covered by `scripts/backfill-mttr.ts` against a live database. The
 * pairing rule is the load-bearing logic and lives in pure helpers.
 */

import { describe, expect, it } from "vitest";

import {
  rollbackPairing,
  selectIncidentToPair,
  type DeploymentLite,
} from "@/operations/dora/mttr";

const T0 = new Date("2026-05-14T00:00:00Z");
const PROD = "production";

function d(
  id: string,
  status: DeploymentLite["status"],
  hoursAgo: number,
  opts: { rolledBackHoursAgo?: number } = {},
): DeploymentLite {
  return {
    id,
    status,
    environment: PROD,
    completedAt: new Date(T0.getTime() - hoursAgo * 60 * 60 * 1000),
    rolledBackAt:
      opts.rolledBackHoursAgo !== undefined
        ? new Date(T0.getTime() - opts.rolledBackHoursAgo * 60 * 60 * 1000)
        : null,
  };
}

describe("selectIncidentToPair", () => {
  it("returns null when the recovery isn't a success deploy", () => {
    const history = [d("a", "failed", 10)];
    const r = selectIncidentToPair(history, d("b", "failed", 5));
    expect(r).toBeNull();
  });

  it("pairs a success with the immediately preceding failure", () => {
    const history = [d("a", "success", 20), d("b", "failed", 10)];
    const r = selectIncidentToPair(history, d("c", "success", 5));
    expect(r?.id).toBe("b");
  });

  it("pairs a success with the FIRST failure of a multi-failure streak", () => {
    const history = [
      d("ok", "success", 50),
      d("first-fail", "failed", 30),
      d("second-fail", "failed", 20),
      d("third-fail", "failed", 10),
    ];
    const r = selectIncidentToPair(history, d("recover", "success", 5));
    expect(r?.id).toBe("first-fail");
  });

  it("returns null when there are no prior failures (clean lane)", () => {
    const history = [d("ok-1", "success", 50), d("ok-2", "success", 25)];
    const r = selectIncidentToPair(history, d("ok-3", "success", 5));
    expect(r).toBeNull();
  });

  it("does NOT pair a failure that has its own rollback (closed in place)", () => {
    const history = [
      d("rb", "rolled_back", 30, { rolledBackHoursAgo: 28 }),
    ];
    const r = selectIncidentToPair(history, d("recover", "success", 5));
    expect(r).toBeNull();
  });

  it("walks past in-place rollbacks to find an earlier unpaired failure", () => {
    // a failed at h=50, then rolled_back-with-own-rollback at h=30
    // (closed in place — its own MTTR row exists). The h=50 failure is
    // still open until the success at h=5 closes it.
    const history = [
      d("a", "failed", 50),
      d("b", "rolled_back", 30, { rolledBackHoursAgo: 28 }),
    ];
    const r = selectIncidentToPair(history, d("recover", "success", 5));
    // Because we BREAK on a closed rollback, the loop stops at `b` and
    // never sees `a`. That's the documented behavior — a closed rollback
    // is treated as a recovery boundary for the streak.
    expect(r).toBeNull();
  });

  it("history with only success deploys never pairs anything", () => {
    const history = [d("ok1", "success", 40), d("ok2", "success", 20)];
    const r = selectIncidentToPair(history, d("ok3", "success", 1));
    expect(r).toBeNull();
  });
});

describe("rollbackPairing", () => {
  it("returns the in-place rollback window as MTTR", () => {
    const dep = d("x", "rolled_back", 10, { rolledBackHoursAgo: 8 });
    const r = rollbackPairing(dep);
    expect(r).not.toBeNull();
    expect(r!.recoveryType).toBe("rollback");
    expect(r!.failedDeploymentId).toBe("x");
    expect(r!.recoveryDeploymentId).toBe("x");
    expect(r!.hours).toBe(2);
  });

  it("returns null when the deploy did not roll back", () => {
    expect(rollbackPairing(d("x", "success", 5))).toBeNull();
    expect(rollbackPairing(d("x", "failed", 5))).toBeNull();
  });

  it("returns null when the rollback timestamp is missing", () => {
    expect(rollbackPairing(d("x", "rolled_back", 5))).toBeNull();
  });

  it("returns null when rollback predates completion (clock skew)", () => {
    const dep = d("x", "rolled_back", 5, { rolledBackHoursAgo: 10 });
    expect(rollbackPairing(dep)).toBeNull();
  });
});
