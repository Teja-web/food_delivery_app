import { describe, it, expect } from "vitest";
import { parseShortSyntax } from "./parser";

describe("parseShortSyntax", () => {
  it("returns empty for empty input", () => {
    expect(parseShortSyntax("")).toEqual({ title: "" });
    expect(parseShortSyntax("   ")).toEqual({ title: "" });
  });

  it("returns title-only when no tokens present", () => {
    expect(parseShortSyntax("fix payment edge case")).toEqual({
      title: "fix payment edge case",
    });
  });

  it("parses #kind", () => {
    const r = parseShortSyntax("fix payment edge case #spec");
    expect(r.kind).toBe("spec");
    expect(r.title).toBe("fix payment edge case");
  });

  it("parses +project-slug", () => {
    const r = parseShortSyntax("ship release notes +payments");
    expect(r.projectSlug).toBe("payments");
    expect(r.title).toBe("ship release notes");
  });

  it("parses @assignee", () => {
    const r = parseShortSyntax("review the diff @alice");
    expect(r.assignee).toBe("alice");
    expect(r.dueDate).toBeUndefined();
    expect(r.title).toBe("review the diff");
  });

  it("parses @YYYY-MM-DD as due date, not assignee", () => {
    const r = parseShortSyntax("feature gate cutover @2026-12-01");
    expect(r.dueDate).toBe("2026-12-01");
    expect(r.assignee).toBeUndefined();
    expect(r.title).toBe("feature gate cutover");
  });

  it("parses →approval:target", () => {
    const r = parseShortSyntax("requirement change →approval:eng-lead");
    expect(r.approvalTarget).toBe("eng-lead");
    expect(r.title).toBe("requirement change");
  });

  it("accepts ->approval: as ASCII fallback", () => {
    const r = parseShortSyntax("requirement change ->approval:eng-lead");
    expect(r.approvalTarget).toBe("eng-lead");
  });

  it("parses estimates (m, h, d) and sums them in minutes", () => {
    expect(parseShortSyntax("task 30m").estimateMinutes).toBe(30);
    expect(parseShortSyntax("task 2h").estimateMinutes).toBe(120);
    expect(parseShortSyntax("task 3d").estimateMinutes).toBe(60 * 8 * 3);
    // 1h 30m = 90 min
    expect(parseShortSyntax("compound 1h 30m").estimateMinutes).toBe(90);
  });

  it("parses a full mixed input", () => {
    const r = parseShortSyntax(
      "fix payment edge case #spec +payments @alice 2d →approval:eng-lead",
    );
    expect(r).toEqual({
      title: "fix payment edge case",
      kind: "spec",
      projectSlug: "payments",
      assignee: "alice",
      estimateMinutes: 60 * 8 * 2,
      approvalTarget: "eng-lead",
    });
  });

  it("requires a leading space before sigils", () => {
    // SP convention: `Task#urgent` does not parse #urgent.
    const r = parseShortSyntax("Task#urgent");
    expect(r.kind).toBeUndefined();
    expect(r.title).toBe("Task#urgent");
  });

  it("strips tokens but preserves the title's word spacing", () => {
    const r = parseShortSyntax("a   b   c #spec d");
    expect(r.kind).toBe("spec");
    expect(r.title).toBe("a b c d");
  });

  it("uses the last value when a token kind appears twice", () => {
    const r = parseShortSyntax("x #adr y #spec");
    expect(r.kind).toBe("spec");
  });

  it("does not double-count an ISO date as an assignee", () => {
    const r = parseShortSyntax("milestone @2026-12-01 @alice");
    expect(r.dueDate).toBe("2026-12-01");
    expect(r.assignee).toBe("alice");
  });

  it("lowercases captures for stable matching downstream", () => {
    const r = parseShortSyntax("X #Spec +Payments @Alice");
    expect(r.kind).toBe("spec");
    expect(r.projectSlug).toBe("payments");
    expect(r.assignee).toBe("alice");
  });
});
