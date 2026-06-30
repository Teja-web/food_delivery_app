import { describe, expect, it } from "vitest";

import { buildJiraPlanDescription, planKindToJiraType } from "@/lib/integrations/outbound";

describe("buildJiraPlanDescription", () => {
  it("includes structured plan details when syncing to Jira", () => {
    const description = buildJiraPlanDescription({
      id: "plan_123",
      kind: "story",
      slug: "checkout-idempotency",
      status: "approved",
      priority: "p1",
      effortEstimate: "3d",
      dueDate: new Date("2026-07-15T00:00:00.000Z"),
      assigneeName: "Sam Rivera",
      assigneeId: null,
      summary: "Make checkout retries safe.",
      body: "Implementation notes live here.",
      details: {
        asA: "shopper",
        iWant: "safe checkout retries",
        soThat: "I do not get double charged",
        acceptanceCriteria: ["Duplicate POSTs reuse the original result", "Retries are audited"],
      },
    });

    expect(description).toContain("Coznt plan artifact");
    expect(description).toContain("- Kind: Story");
    expect(description).toContain("- Status: Approved");
    expect(description).toContain("- Due date: 2026-07-15");
    expect(description).toContain("Plan details");
    expect(description).toContain("Acceptance Criteria:");
    expect(description).toContain("- Duplicate POSTs reuse the original result");
    expect(description).toContain("Body");
    expect(description).toContain("Implementation notes live here.");
  });
});

describe("planKindToJiraType", () => {
  it("uses Jira-default issue types while preserving artifact type elsewhere", () => {
    expect(planKindToJiraType("epic")).toBe("Epic");
    expect(planKindToJiraType("feature")).toBe("Story");
    expect(planKindToJiraType("story")).toBe("Story");
    expect(planKindToJiraType("adr")).toBe("Task");
    expect(planKindToJiraType("unknown")).toBe("Task");
  });
});
