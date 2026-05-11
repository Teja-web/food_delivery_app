/**
 * SEO-surface tests for the anonymized public DTO. Same rule as the core
 * anonymize suite: nothing rendered into JSON-LD or <meta> tags may leak
 * org name, exact comp, or internal description text in anonymized mode.
 *
 * These run against the same fixtures used in tests/anonymize.test.ts so a
 * regression in either layer fails loudly here.
 */

import { describe, expect, it } from "vitest";
import {
  appBaseUrl,
  jobPostingJsonLd,
  metaDescription,
  opportunityUrl,
} from "@/lib/anonymize/seo";
import type {
  AnonymizedRoleDTO,
  PublicRoleFullDTO,
} from "@/lib/anonymize";

const ANON_DTO: AnonymizedRoleDTO = {
  visibility: "anonymized",
  slug: "abc123def456",
  title: "Senior Software Engineer",
  publicLabel: "Series B fintech, Bengaluru",
  industry: "fintech",
  stage: "series_b",
  region: "bengaluru",
  size: "51-200",
  compBand: "₹60-90 LPA",
  level: "senior",
  employmentType: "full_time",
  skills: ["TypeScript", "Postgres"],
  summary: null,
  postedAt: "2026-01-15T10:00:00.000Z",
};

const PUBLIC_DTO: PublicRoleFullDTO = {
  visibility: "public",
  slug: "abc123def456",
  title: "Senior Software Engineer",
  orgName: "Acme Stealth Robotics, Inc.",
  orgWebsite: "https://acme.example.com",
  description: "<p>We do amazing things at Acme.</p>",
  team: "Platform",
  department: "Engineering",
  location: "Bengaluru, India",
  comp: { min: 50, max: 70, currency: "INR" },
  employmentType: "full_time",
  skills: ["TypeScript"],
  postedAt: "2026-01-15T10:00:00.000Z",
};

/* ─────────── URL helpers ─────────── */

describe("appBaseUrl", () => {
  it("strips a trailing slash", () => {
    const original = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://dilliznt.example.com/";
    expect(appBaseUrl()).toBe("https://dilliznt.example.com");
    process.env.NEXT_PUBLIC_APP_URL = original;
  });
});

describe("opportunityUrl", () => {
  it("composes /opportunities/<slug>", () => {
    const url = opportunityUrl("abc123def456");
    expect(url).toMatch(/\/opportunities\/abc123def456$/);
  });
});

/* ─────────── JSON-LD: anonymized leak gate ─────────── */

describe("jobPostingJsonLd — anonymized", () => {
  const ld = jobPostingJsonLd(ANON_DTO);
  const json = JSON.stringify(ld);

  it("uses the public label as hiringOrganization.name (no legal name)", () => {
    const org = (ld as { hiringOrganization: { name: string } }).hiringOrganization;
    expect(org.name).toBe("Series B fintech, Bengaluru");
  });

  it("never references a legal org name or website", () => {
    expect(json).not.toContain("Acme");
    expect(json).not.toContain("acme.example.com");
  });

  it("never emits a baseSalary block (machine-readable comp would defeat banding)", () => {
    expect(ld).not.toHaveProperty("baseSalary");
    expect(json).not.toMatch(/"min(Value)?":\s*50/);
    expect(json).not.toMatch(/"max(Value)?":\s*70/);
  });

  it("uses region as addressRegion and omits addressLocality", () => {
    const addr = (ld as { jobLocation: { address: Record<string, unknown> } })
      .jobLocation.address;
    expect(addr.addressRegion).toBe("bengaluru");
    expect(addr).not.toHaveProperty("addressLocality");
  });

  it("includes the slug as the structured identifier", () => {
    expect((ld as { identifier: { value: string } }).identifier.value).toBe(
      "abc123def456",
    );
  });
});

/* ─────────── JSON-LD: public mode (consented) ─────────── */

describe("jobPostingJsonLd — public", () => {
  const ld = jobPostingJsonLd(PUBLIC_DTO);

  it("emits a baseSalary block with exact comp values", () => {
    const salary = (ld as {
      baseSalary: { value: { minValue: number; maxValue: number } };
    }).baseSalary;
    expect(salary.value.minValue).toBe(50);
    expect(salary.value.maxValue).toBe(70);
  });

  it("uses the legal org name and website", () => {
    const org = (ld as { hiringOrganization: { name: string; sameAs?: string } })
      .hiringOrganization;
    expect(org.name).toBe("Acme Stealth Robotics, Inc.");
    expect(org.sameAs).toBe("https://acme.example.com");
  });
});

/* ─────────── employment type mapping ─────────── */

describe("jobPostingJsonLd — employmentType", () => {
  it.each([
    ["full_time", "FULL_TIME"],
    ["part_time", "PART_TIME"],
    ["contract", "CONTRACTOR"],
    ["internship", "INTERN"],
    ["temporary", "TEMPORARY"],
  ] as const)("%s → %s", (input, expected) => {
    const ld = jobPostingJsonLd({ ...ANON_DTO, employmentType: input });
    expect((ld as { employmentType?: string }).employmentType).toBe(expected);
  });

  it("omits employmentType for unknown values", () => {
    const ld = jobPostingJsonLd({ ...ANON_DTO, employmentType: "freelance_weekends" });
    expect(ld).not.toHaveProperty("employmentType");
  });
});

/* ─────────── meta description ─────────── */

describe("metaDescription", () => {
  it("uses the publicLabel for anonymized roles, never internal copy", () => {
    const desc = metaDescription(ANON_DTO);
    expect(desc).toContain("Series B fintech, Bengaluru");
    expect(desc).not.toContain("Acme");
  });

  it("includes comp band when set on anonymized role", () => {
    expect(metaDescription(ANON_DTO)).toContain("₹60-90 LPA");
  });

  it("falls back without comp band when null", () => {
    expect(metaDescription({ ...ANON_DTO, compBand: null })).not.toContain("(");
  });

  it("clips at 155 chars and ends with an ellipsis when truncated", () => {
    const longDescription = "x".repeat(500);
    const desc = metaDescription({ ...PUBLIC_DTO, description: longDescription });
    expect(desc.length).toBeLessThanOrEqual(155);
    expect(desc.endsWith("…")).toBe(true);
  });

  it("does not clip short descriptions", () => {
    const desc = metaDescription({ ...PUBLIC_DTO, description: "Short" });
    expect(desc).toBe("Short");
  });
});
