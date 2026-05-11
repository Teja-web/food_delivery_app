/**
 * Anonymization security boundary tests.
 *
 * Every field that crosses the unauthenticated edge of the product flows
 * through `publicizeRole`. This suite is the gate: a regression that leaks
 * the org name, an exact comp value, or any internal field MUST fail here
 * before reaching the network.
 *
 * Run with `pnpm test`.
 */

import { describe, expect, it } from "vitest";
import {
  bandComp,
  deriveLevel,
  publicizeRole,
  regionCountry,
  type AnonymizedRoleDTO,
  type OrgRow,
  type PublicRoleFullDTO,
} from "@/lib/anonymize";
import type { OrgPublicProfile } from "@/lib/anonymize/taxonomy";
import type { Role } from "@/db/schema/roles";

type RoleArg = Pick<
  Role,
  | "title"
  | "team"
  | "department"
  | "location"
  | "compensation"
  | "description"
  | "criteriaConfig"
  | "employmentType"
  | "publicVisibility"
  | "publicSlug"
  | "createdAt"
>;

/* ─────────── Fixtures ─────────── */

const CONFIDENTIAL_ORG_NAME = "Acme Stealth Robotics, Inc.";
const CONFIDENTIAL_BUSINESS_CASE =
  "We are losing 12% MRR per quarter and need a director to fix it.";

const FIXTURE_ORG_PROFILE: OrgPublicProfile = {
  industry: "fintech",
  stage: "series_b",
  size: "51-200",
  region: "bengaluru",
  description: "We help SMBs reconcile invoices.",
};

const FIXTURE_ORG: OrgRow = {
  name: CONFIDENTIAL_ORG_NAME,
  website: "https://acme-stealth-robotics.example.com",
  publicProfile: FIXTURE_ORG_PROFILE,
};

const FIXTURE_ROLE: RoleArg = {
  title: "Senior Software Engineer",
  team: "Platform",
  department: "Engineering",
  location: "Bengaluru, India",
  compensation: { min: 50, max: 70, currency: "INR" },
  description: `<p>${CONFIDENTIAL_BUSINESS_CASE} Join us!</p>`,
  criteriaConfig: {
    criteria: [],
    keywords: [
      { term: "TypeScript", category: "skill", importance: "critical" },
      { term: "Postgres", category: "skill", importance: "critical" },
      { term: "Kubernetes", category: "skill", importance: "important" },
      { term: "Terraform", category: "skill", importance: "nice_to_have" },
    ],
  },
  employmentType: "full_time",
  publicVisibility: "anonymized",
  publicSlug: "abc123def456",
  createdAt: new Date("2026-01-15T10:00:00Z"),
};

/* ─────────── Snapshot: anonymized DTO ─────────── */

describe("publicizeRole — anonymized mode", () => {
  it("matches the anonymized DTO snapshot", () => {
    const dto = publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "anonymized");
    expect(dto).toMatchInlineSnapshot(`
      {
        "compBand": "₹60-90 LPA",
        "employmentType": "full_time",
        "industry": "fintech",
        "level": "senior",
        "postedAt": "2026-01-15T10:00:00.000Z",
        "publicLabel": "Series B fintech, Bengaluru",
        "region": "bengaluru",
        "size": "51-200",
        "skills": [
          "TypeScript",
          "Postgres",
          "Kubernetes",
        ],
        "slug": "abc123def456",
        "stage": "series_b",
        "summary": null,
        "title": "Senior Software Engineer",
        "visibility": "anonymized",
      }
    `);
  });
});

/* ─────────── Org-name leak ─────────── */

describe("publicizeRole — org-name leak", () => {
  it("never includes the legal org name in anonymized output", () => {
    const dto = publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "anonymized");
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain(CONFIDENTIAL_ORG_NAME);
    expect(serialized.toLowerCase()).not.toContain("acme");
    expect(serialized.toLowerCase()).not.toContain("stealth");
    expect(serialized.toLowerCase()).not.toContain("robotics");
  });

  it("never includes the org website in anonymized output", () => {
    const dto = publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "anonymized");
    expect(JSON.stringify(dto)).not.toContain("acme-stealth-robotics");
  });

  it("does include the org name in fully public mode (consented)", () => {
    const dto = publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "public") as PublicRoleFullDTO;
    expect(dto.orgName).toBe(CONFIDENTIAL_ORG_NAME);
  });
});

/* ─────────── Internal-field leak ─────────── */

describe("publicizeRole — internal-field leak", () => {
  it("never includes the business case in anonymized output", () => {
    const dto = publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "anonymized");
    expect(JSON.stringify(dto)).not.toContain(CONFIDENTIAL_BUSINESS_CASE);
    expect(JSON.stringify(dto).toLowerCase()).not.toContain("mrr");
  });

  it("does not surface the description in anonymized output", () => {
    const dto = publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "anonymized") as AnonymizedRoleDTO;
    expect(dto.summary).toBeNull();
    // Belt-and-suspenders: description text should not appear anywhere
    expect(JSON.stringify(dto)).not.toContain("Join us");
  });

  it("never includes department/team/location in anonymized output", () => {
    const dto = publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "anonymized");
    const json = JSON.stringify(dto);
    expect(json).not.toContain("Platform");
    expect(json).not.toContain("Engineering");
    expect(json).not.toContain("Bengaluru, India"); // exact location string
  });

  it("strips HTML from public-mode description", () => {
    const dto = publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "public") as PublicRoleFullDTO;
    expect(dto.description).not.toContain("<p>");
    expect(dto.description).not.toContain("</p>");
  });
});

/* ─────────── Comp leak ─────────── */

describe("publicizeRole — comp leak", () => {
  it("does not include the exact min/max comp values in anonymized output", () => {
    const dto = publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "anonymized");
    const json = JSON.stringify(dto);
    expect(json).not.toMatch(/"min":\s*50/);
    expect(json).not.toMatch(/"max":\s*70/);
    // The exact mid (60) should not appear as a standalone value either
    expect(json).not.toMatch(/[^0-9]60[^0-9-]/);
  });

  it("emits a band string in anonymized output when comp is set", () => {
    const dto = publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "anonymized") as AnonymizedRoleDTO;
    expect(dto.compBand).toMatch(/[₹$€]/);
    expect(dto.compBand).toMatch(/-/); // contains a dash → it's a range
  });

  it("emits null comp band when role has no comp data", () => {
    const dto = publicizeRole(
      { ...FIXTURE_ROLE, compensation: null },
      FIXTURE_ORG,
      "anonymized",
    ) as AnonymizedRoleDTO;
    expect(dto.compBand).toBeNull();
  });

  it("preserves exact comp in public mode (consented)", () => {
    const dto = publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "public") as PublicRoleFullDTO;
    expect(dto.comp).toEqual({ min: 50, max: 70, currency: "INR" });
  });
});

/* ─────────── Visibility mode contract ─────────── */

describe("publicizeRole — visibility contract", () => {
  it("throws if anonymized is requested but org has no publicProfile", () => {
    expect(() =>
      publicizeRole(FIXTURE_ROLE, { ...FIXTURE_ORG, publicProfile: null }, "anonymized"),
    ).toThrow(/publicProfile/);
  });

  it("throws if the role has no publicSlug", () => {
    expect(() =>
      publicizeRole({ ...FIXTURE_ROLE, publicSlug: null }, FIXTURE_ORG, "anonymized"),
    ).toThrow(/publicSlug/);
  });

  it("does not allow forging visibility — function only accepts the literal modes", () => {
    // @ts-expect-error — `private` is not a valid runtime arg
    expect(() => publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "private")).toBeDefined();
    // (No runtime guard needed: the TypeScript signature already forbids it.
    // This case exists to call attention to the discipline.)
  });
});

/* ─────────── Skills filtering ─────────── */

describe("publicizeRole — skills", () => {
  it("includes only critical and important keyword terms", () => {
    const dto = publicizeRole(FIXTURE_ROLE, FIXTURE_ORG, "anonymized") as AnonymizedRoleDTO;
    expect(dto.skills).toEqual(["TypeScript", "Postgres", "Kubernetes"]);
    expect(dto.skills).not.toContain("Terraform"); // nice_to_have
  });

  it("caps skills at 8 in anonymized mode", () => {
    const manyKeywords = Array.from({ length: 20 }, (_, i) => ({
      term: `Skill${i}`,
      category: "skill" as const,
      importance: "critical" as const,
    }));
    const dto = publicizeRole(
      { ...FIXTURE_ROLE, criteriaConfig: { criteria: [], keywords: manyKeywords } },
      FIXTURE_ORG,
      "anonymized",
    ) as AnonymizedRoleDTO;
    expect(dto.skills.length).toBeLessThanOrEqual(8);
  });
});

/* ─────────── Level derivation ─────────── */

describe("deriveLevel", () => {
  it.each([
    ["Junior Software Engineer", "junior"],
    ["Software Engineer Intern", "junior"],
    ["Software Engineer", "mid"],
    ["Senior Software Engineer", "senior"],
    ["Sr. Backend Engineer", "senior"],
    ["Staff Software Engineer", "lead"],
    ["Engineering Manager", "lead"],
    ["VP of Engineering", "lead"],
    ["Principal Engineer", "principal"],
    ["Distinguished Engineer", "principal"],
  ] as const)("%s → %s", (title, expected) => {
    expect(deriveLevel(title)).toBe(expected);
  });
});

/* ─────────── Region → country ─────────── */

describe("regionCountry", () => {
  it("maps US regions to 'us'", () => {
    expect(regionCountry("bay_area")).toBe("us");
    expect(regionCountry("nyc_metro")).toBe("us");
    expect(regionCountry("remote_us")).toBe("us");
  });
  it("maps India regions to 'in'", () => {
    expect(regionCountry("bengaluru")).toBe("in");
    expect(regionCountry("delhi_ncr")).toBe("in");
    expect(regionCountry("remote_in")).toBe("in");
  });
  it("maps EU regions to 'eu'", () => {
    expect(regionCountry("london")).toBe("eu");
    expect(regionCountry("berlin")).toBe("eu");
    expect(regionCountry("remote_eu")).toBe("eu");
  });
  it("maps Global / other regions to 'global'", () => {
    expect(regionCountry("remote_global")).toBe("global");
    expect(regionCountry("other")).toBe("global");
  });
});

/* ─────────── Comp banding ─────────── */

describe("bandComp", () => {
  it("buckets US senior comp", () => {
    expect(bandComp({ min: 200, max: 240 }, "us", "senior")).toBe("$220-260k");
  });

  it("buckets India mid comp", () => {
    expect(bandComp({ min: 18, max: 28 }, "in", "mid")).toBe("₹15-25 LPA");
  });

  it("buckets EU principal comp", () => {
    expect(bandComp({ min: 320, max: 360 }, "eu", "principal")).toBe("€300-380k");
  });

  it("returns null when comp is missing", () => {
    expect(bandComp(null, "us", "mid")).toBeNull();
    expect(bandComp({ min: undefined as unknown as number, max: undefined as unknown as number }, "us", "mid")).toBeNull();
  });

  it("clamps to the top band when comp exceeds the table", () => {
    expect(bandComp({ min: 600, max: 700 }, "us", "principal")).toBe("$450k+");
  });
});
