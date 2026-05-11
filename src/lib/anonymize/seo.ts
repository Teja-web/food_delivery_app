/**
 * Public-surface URL helpers + structured data builders. Kept next to the
 * anonymizer because changes here often affect what's exposed publicly.
 */

import type { PublicRoleDTO } from ".";

export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_BASE_URL ??
    "http://localhost:3029"
  ).replace(/\/$/, "");
}

export function opportunityUrl(slug: string): string {
  return `${appBaseUrl()}/opportunities/${slug}`;
}

/**
 * Build schema.org JobPosting structured data for a role's detail page.
 * For anonymized roles, `hiringOrganization.name` is the public label
 * ("Series B fintech, Bengaluru") — never the legal name.
 */
export function jobPostingJsonLd(dto: PublicRoleDTO): Record<string, unknown> {
  const url = opportunityUrl(dto.slug);
  const baseSalary = buildSalary(dto);
  const employmentType = dto.employmentType
    ? mapEmploymentType(dto.employmentType)
    : undefined;

  if (dto.visibility === "anonymized") {
    return {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: dto.title,
      description: `${dto.title} role. Sign up to view details and the hiring company.`,
      datePosted: dto.postedAt,
      hiringOrganization: {
        "@type": "Organization",
        name: dto.publicLabel,
      },
      jobLocation: {
        "@type": "Place",
        address: { "@type": "PostalAddress", addressRegion: dto.region },
      },
      ...(baseSalary ? { baseSalary } : {}),
      ...(employmentType ? { employmentType } : {}),
      url,
      identifier: { "@type": "PropertyValue", value: dto.slug },
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: dto.title,
    description: dto.description ?? `${dto.title} at ${dto.orgName ?? "—"}`,
    datePosted: dto.postedAt,
    hiringOrganization: {
      "@type": "Organization",
      name: dto.orgName ?? "Open role",
      ...(dto.orgWebsite ? { sameAs: dto.orgWebsite } : {}),
    },
    jobLocation: dto.location
      ? {
          "@type": "Place",
          address: { "@type": "PostalAddress", addressLocality: dto.location },
        }
      : undefined,
    ...(baseSalary ? { baseSalary } : {}),
    ...(employmentType ? { employmentType } : {}),
    url,
    identifier: { "@type": "PropertyValue", value: dto.slug },
  };
}

function buildSalary(dto: PublicRoleDTO): Record<string, unknown> | undefined {
  if (dto.visibility === "public" && dto.comp?.min != null && dto.comp.max != null) {
    return {
      "@type": "MonetaryAmount",
      currency: dto.comp.currency ?? "USD",
      value: {
        "@type": "QuantitativeValue",
        minValue: dto.comp.min,
        maxValue: dto.comp.max,
        unitText: "YEAR",
      },
    };
  }
  // Anonymized roles deliberately omit machine-readable salary — exposing min/max
  // here would defeat the comp-banding redaction.
  return undefined;
}

function mapEmploymentType(type: string): string | undefined {
  switch (type) {
    case "full_time":
    case "fulltime":
      return "FULL_TIME";
    case "part_time":
    case "parttime":
      return "PART_TIME";
    case "contract":
    case "contractor":
      return "CONTRACTOR";
    case "internship":
    case "intern":
      return "INTERN";
    case "temporary":
      return "TEMPORARY";
    default:
      return undefined;
  }
}

/**
 * Description for `<meta name="description">`. Capped at 155 chars to stay
 * within typical SERP truncation.
 */
export function metaDescription(dto: PublicRoleDTO): string {
  if (dto.visibility === "public" && dto.description) {
    return clip(dto.description, 155);
  }
  // Anonymized: a stable, useful description that doesn't leak.
  if (dto.visibility === "anonymized") {
    const parts = [
      dto.title,
      `at a ${dto.publicLabel}`,
      dto.compBand ? `(${dto.compBand})` : null,
    ].filter(Boolean);
    return clip(parts.join(" "), 155);
  }
  return clip(`${dto.title} — open role`, 155);
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}
