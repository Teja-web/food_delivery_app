/**
 * Taxonomy / label invariants. The picker forms, the public DTO, and the
 * k-anonymity bucketing all read from these enums — if a value here loses
 * its label or the enum drifts from the labels map, the public surface
 * silently renders "undefined" or throws. This suite catches that.
 */

import { describe, expect, it } from "vitest";
import {
  INDUSTRY_LABELS,
  INDUSTRY_VALUES,
  REGION_GROUPS,
  REGION_LABELS,
  REGION_LABELS_CARD,
  REGION_VALUES,
  SIZE_LABELS,
  SIZE_VALUES,
  STAGE_LABELS,
  STAGE_VALUES,
  composePublicLabel,
  orgPublicProfileSchema,
  type OrgPublicProfile,
} from "@/lib/anonymize/taxonomy";

const FIXTURE_PROFILE: OrgPublicProfile = {
  industry: "fintech",
  stage: "series_b",
  size: "51-200",
  region: "bengaluru",
};

describe("composePublicLabel", () => {
  it("formats stage + lowercased industry + region", () => {
    expect(composePublicLabel(FIXTURE_PROFILE)).toBe("Series B fintech, Bengaluru");
  });

  it("lowercases the industry but preserves stage casing", () => {
    expect(
      composePublicLabel({ ...FIXTURE_PROFILE, industry: "saas_enterprise" }),
    ).toBe("Series B saas / enterprise, Bengaluru");
  });

  it("never returns a string containing 'undefined'", () => {
    for (const industry of INDUSTRY_VALUES) {
      for (const stage of STAGE_VALUES) {
        for (const region of REGION_VALUES) {
          const label = composePublicLabel({
            ...FIXTURE_PROFILE,
            industry,
            stage,
            region,
          });
          expect(label).not.toContain("undefined");
          expect(label.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("label coverage", () => {
  it("has an INDUSTRY_LABEL for every INDUSTRY_VALUE", () => {
    for (const v of INDUSTRY_VALUES) {
      expect(INDUSTRY_LABELS[v]).toBeTruthy();
    }
  });
  it("has a STAGE_LABEL for every STAGE_VALUE", () => {
    for (const v of STAGE_VALUES) {
      expect(STAGE_LABELS[v]).toBeTruthy();
    }
  });
  it("has a SIZE_LABEL for every SIZE_VALUE", () => {
    for (const v of SIZE_VALUES) {
      expect(SIZE_LABELS[v]).toBeTruthy();
    }
  });
  it("has a REGION_LABEL and REGION_LABEL_CARD for every REGION_VALUE", () => {
    for (const v of REGION_VALUES) {
      expect(REGION_LABELS[v]).toBeTruthy();
      expect(REGION_LABELS_CARD[v]).toBeTruthy();
    }
  });
});

describe("REGION_GROUPS", () => {
  it("partitions every region exactly once across groups", () => {
    const flat = REGION_GROUPS.flatMap((g) => g.values);
    expect(new Set(flat).size).toBe(flat.length); // no duplicates
    expect(flat.sort()).toEqual([...REGION_VALUES].sort()); // covers all
  });
});

describe("orgPublicProfileSchema", () => {
  it("accepts a valid profile", () => {
    expect(() => orgPublicProfileSchema.parse(FIXTURE_PROFILE)).not.toThrow();
  });

  it("rejects an unknown industry value", () => {
    expect(() =>
      orgPublicProfileSchema.parse({ ...FIXTURE_PROFILE, industry: "crypto_bro" }),
    ).toThrow();
  });

  it("caps description at 280 chars", () => {
    const longDesc = "x".repeat(281);
    expect(() =>
      orgPublicProfileSchema.parse({ ...FIXTURE_PROFILE, description: longDesc }),
    ).toThrow();
  });

  it("permits an empty website url string (form leaves the field blank)", () => {
    expect(() =>
      orgPublicProfileSchema.parse({ ...FIXTURE_PROFILE, websiteUrl: "" }),
    ).not.toThrow();
  });

  it("rejects a malformed website url", () => {
    expect(() =>
      orgPublicProfileSchema.parse({ ...FIXTURE_PROFILE, websiteUrl: "not a url" }),
    ).toThrow();
  });
});
