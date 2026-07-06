import { describe, expect, it } from "vitest";

import { resolveProjectLifecycleArtifactValidation } from "@/operations/artifacts";

describe("resolveProjectLifecycleArtifactValidation", () => {
  it("blocks duplicate requirements creation", () => {
    const err = resolveProjectLifecycleArtifactValidation({
      target: "requirements",
      isCreate: true,
      hasRequirements: true,
      hasDesign: false,
    });
    expect(err).toBe("requirements.md already exists.\nNo changes were made.");
  });

  it("blocks design creation when requirements is missing", () => {
    const err = resolveProjectLifecycleArtifactValidation({
      target: "design",
      isCreate: true,
      hasRequirements: false,
      hasDesign: false,
    });
    expect(err).toBe(
      "Cannot create design.md because requirements.md does not exist.\n\nPlease create requirements.md first.",
    );
  });

  it("blocks duplicate design creation", () => {
    const err = resolveProjectLifecycleArtifactValidation({
      target: "design",
      isCreate: true,
      hasRequirements: true,
      hasDesign: true,
    });
    expect(err).toBe("design.md already exists.\n\nNo changes were made.");
  });

  it("reports all missing prerequisites for development creation", () => {
    const err = resolveProjectLifecycleArtifactValidation({
      target: "development",
      isCreate: true,
      hasRequirements: false,
      hasDesign: false,
    });
    expect(err).toBe("Development artifact requires prerequisite artifact(s): Requirements, Design.");
  });

  it("allows development creation when requirements and design exist", () => {
    const err = resolveProjectLifecycleArtifactValidation({
      target: "development",
      isCreate: true,
      hasRequirements: true,
      hasDesign: true,
    });
    expect(err).toBeNull();
  });

  it("allows design creation when requirements exists and design is missing", () => {
    const err = resolveProjectLifecycleArtifactValidation({
      target: "design",
      isCreate: true,
      hasRequirements: true,
      hasDesign: false,
    });
    expect(err).toBeNull();
  });

  it("does not enforce creation rules on update", () => {
    const err = resolveProjectLifecycleArtifactValidation({
      target: "requirements",
      isCreate: false,
      hasRequirements: true,
      hasDesign: true,
    });
    expect(err).toBeNull();
  });
});
