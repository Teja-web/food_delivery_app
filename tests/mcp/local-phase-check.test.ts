/**
 * Tests for the MCP-side fast-fail phase check that runs in the
 * CallToolRequestSchema dispatcher before any network call.
 *
 * These cover the local check directly — full dispatcher round-trips
 * through the SDK would need env setup + fetch mocking; not worth the
 * complexity for a 30-line check.
 */

import { describe, expect, it } from "vitest";

import { checkLocalPhase } from "@/mcp/phase-data";

describe("checkLocalPhase", () => {
  describe("no project bound (currentPhase = null)", () => {
    it("allows set_project", () => {
      const r = checkLocalPhase("set_project", null);
      expect(r.allowed).toBe(true);
    });

    it("allows get_my_context", () => {
      const r = checkLocalPhase("get_my_context", null);
      expect(r.allowed).toBe(true);
    });

    it("denies content verbs with a recoverable message", () => {
      const r = checkLocalPhase("get_project_status", null);
      expect(r.allowed).toBe(false);
      expect(r.message).toContain("set_project");
    });

    it("denies write verbs with a recoverable message", () => {
      const r = checkLocalPhase("create_requirement", null);
      expect(r.allowed).toBe(false);
      expect(r.message).toContain("set_project");
    });

    it("allows draft_* verbs even without a project bound (drafts are local-only)", () => {
      // Drafts live in MCP-process memory and are project-agnostic.
      // The agent should be able to compose locally before deciding
      // which project to push to. Discovered via subprocess smoke test.
      const drafts = [
        "draft_requirement",
        "list_draft_requirements",
        "update_draft_requirement",
        "delete_draft_requirement",
      ];
      for (const v of drafts) {
        const r = checkLocalPhase(v, null);
        expect(r.allowed, `${v} should be allowed with null project`).toBe(true);
      }
    });
  });

  describe("ALWAYS_ALLOWED verbs", () => {
    it("allows get_my_context in every phase", () => {
      for (const phase of ["requirements", "design", "development", "testing", "cicd", "monitoring"] as const) {
        const r = checkLocalPhase("get_my_context", phase);
        expect(r.allowed, `denied in ${phase}`).toBe(true);
      }
    });

    it("allows invoke_skill in every phase", () => {
      for (const phase of ["requirements", "design", "development", "testing", "cicd", "monitoring"] as const) {
        const r = checkLocalPhase("invoke_skill", phase);
        expect(r.allowed, `denied in ${phase}`).toBe(true);
      }
    });
  });

  describe("phase-gated verbs", () => {
    it("allows create_requirement in requirements phase", () => {
      const r = checkLocalPhase("create_requirement", "requirements");
      expect(r.allowed).toBe(true);
    });

    it("denies create_requirement in development phase", () => {
      const r = checkLocalPhase("create_requirement", "development");
      expect(r.allowed).toBe(false);
      expect(r.message).toContain("create_requirement");
      expect(r.message).toContain("development");
      expect(r.message).toContain("requirements"); // lists allowed phases
    });

    it("allows log_decision in design + development", () => {
      expect(checkLocalPhase("log_decision", "design").allowed).toBe(true);
      expect(checkLocalPhase("log_decision", "development").allowed).toBe(true);
    });

    it("denies log_decision in requirements + testing + cicd + monitoring", () => {
      for (const phase of ["requirements", "testing", "cicd", "monitoring"] as const) {
        const r = checkLocalPhase("log_decision", phase);
        expect(r.allowed, `should deny in ${phase}`).toBe(false);
      }
    });

    it("allows get_pipeline_status in cicd + monitoring only", () => {
      expect(checkLocalPhase("get_pipeline_status", "cicd").allowed).toBe(true);
      expect(checkLocalPhase("get_pipeline_status", "monitoring").allowed).toBe(true);
      for (const phase of ["requirements", "design", "development", "testing"] as const) {
        expect(checkLocalPhase("get_pipeline_status", phase).allowed, `should deny in ${phase}`).toBe(
          false,
        );
      }
    });

    it("allows update_test_result only in testing", () => {
      expect(checkLocalPhase("update_test_result", "testing").allowed).toBe(true);
      for (const phase of ["requirements", "design", "development", "cicd", "monitoring"] as const) {
        expect(checkLocalPhase("update_test_result", phase).allowed, `should deny in ${phase}`).toBe(
          false,
        );
      }
    });
  });

  describe("unknown verbs", () => {
    it("defers to the route (returns allowed) for verbs not in either map", () => {
      // The dispatcher already rejects unknown verbs at the registration
      // layer; this branch is unreachable in practice, but the check
      // shouldn't false-deny.
      const r = checkLocalPhase("nonexistent_verb", "development");
      expect(r.allowed).toBe(true);
    });
  });
});
