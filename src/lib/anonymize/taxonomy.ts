/**
 * Anonymization taxonomy — controlled vocabulary for org public profiles
 * and the per-role public DTO. Defined once here so the form, the DTO, and
 * the (future) k-anonymity check share the same enum values.
 *
 * See docs/phase-2-public-funnel-spec.md.
 */

import { z } from "zod/v4";

export const INDUSTRY_VALUES = [
  "fintech",
  "health_biotech",
  "saas_enterprise",
  "consumer",
  "marketplace",
  "media_entertainment",
  "education",
  "government_ngo",
  "retail_ecommerce",
  "manufacturing_industrial",
  "logistics_transport",
  "other",
] as const;

export const STAGE_VALUES = [
  "pre_seed_seed",
  "series_a",
  "series_b",
  "series_c_plus",
  "late_private",
  "public",
  "bootstrapped_profitable",
  "government_nonprofit",
] as const;

export const SIZE_VALUES = [
  "1-10",
  "11-50",
  "51-200",
  "201-1000",
  "1001-5000",
  "5000+",
] as const;

export const REGION_VALUES = [
  // US
  "bay_area",
  "nyc_metro",
  "los_angeles",
  "boston",
  "seattle",
  "austin",
  "chicago",
  "other_us",
  "remote_us",
  // India
  "bengaluru",
  "mumbai",
  "delhi_ncr",
  "hyderabad",
  "chennai",
  "pune",
  "other_in",
  "remote_in",
  // EU
  "london",
  "berlin",
  "amsterdam",
  "paris",
  "other_eu",
  "remote_eu",
  // Global
  "remote_global",
  "other",
] as const;

export type Industry = (typeof INDUSTRY_VALUES)[number];
export type Stage = (typeof STAGE_VALUES)[number];
export type SizeBucket = (typeof SIZE_VALUES)[number];
export type Region = (typeof REGION_VALUES)[number];

export const INDUSTRY_LABELS: Record<Industry, string> = {
  fintech: "Fintech",
  health_biotech: "Health / Biotech",
  saas_enterprise: "SaaS / Enterprise",
  consumer: "Consumer",
  marketplace: "Marketplace",
  media_entertainment: "Media / Entertainment",
  education: "Education",
  government_ngo: "Government / NGO",
  retail_ecommerce: "Retail / E-commerce",
  manufacturing_industrial: "Manufacturing / Industrial",
  logistics_transport: "Logistics / Transport",
  other: "Other",
};

export const STAGE_LABELS: Record<Stage, string> = {
  pre_seed_seed: "Pre-seed / Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c_plus: "Series C+",
  late_private: "Late-stage private",
  public: "Public",
  bootstrapped_profitable: "Bootstrapped / Profitable",
  government_nonprofit: "Government / Non-profit",
};

export const SIZE_LABELS: Record<SizeBucket, string> = {
  "1-10": "1-10 employees",
  "11-50": "11-50",
  "51-200": "51-200",
  "201-1000": "201-1000",
  "1001-5000": "1001-5000",
  "5000+": "5000+",
};

/**
 * Picker labels — used in admin forms (org settings, role visibility) where
 * the user is choosing buckets and "Other US" makes the taxonomy explicit.
 */
export const REGION_LABELS: Record<Region, string> = {
  bay_area: "SF Bay Area",
  nyc_metro: "NYC Metro",
  los_angeles: "Los Angeles",
  boston: "Boston",
  seattle: "Seattle",
  austin: "Austin",
  chicago: "Chicago",
  other_us: "Other US",
  remote_us: "Remote (US)",
  bengaluru: "Bengaluru",
  mumbai: "Mumbai",
  delhi_ncr: "Delhi NCR",
  hyderabad: "Hyderabad",
  chennai: "Chennai",
  pune: "Pune",
  other_in: "Other India",
  remote_in: "Remote (India)",
  london: "London",
  berlin: "Berlin",
  amsterdam: "Amsterdam",
  paris: "Paris",
  other_eu: "Other EU",
  remote_eu: "Remote (EU)",
  remote_global: "Remote (Global)",
  other: "Other",
};

/**
 * Display labels for compact public surfaces (cards, list rows). Friendlier
 * and shorter — a candidate browsing roles wants "New York" not "NYC Metro",
 * and "Europe" not "Other EU". Picker accuracy isn't the goal here.
 */
export const REGION_LABELS_CARD: Record<Region, string> = {
  bay_area: "SF Bay Area",
  nyc_metro: "New York",
  los_angeles: "Los Angeles",
  boston: "Boston",
  seattle: "Seattle",
  austin: "Austin",
  chicago: "Chicago",
  other_us: "United States",
  remote_us: "Remote (US)",
  bengaluru: "Bengaluru",
  mumbai: "Mumbai",
  delhi_ncr: "Delhi NCR",
  hyderabad: "Hyderabad",
  chennai: "Chennai",
  pune: "Pune",
  other_in: "India",
  remote_in: "Remote (India)",
  london: "London",
  berlin: "Berlin",
  amsterdam: "Amsterdam",
  paris: "Paris",
  other_eu: "Europe",
  remote_eu: "Remote (EU)",
  remote_global: "Remote",
  other: "Various",
};

export const REGION_GROUPS: Array<{ label: string; values: readonly Region[] }> = [
  {
    label: "United States",
    values: [
      "bay_area",
      "nyc_metro",
      "los_angeles",
      "boston",
      "seattle",
      "austin",
      "chicago",
      "other_us",
      "remote_us",
    ],
  },
  {
    label: "India",
    values: ["bengaluru", "mumbai", "delhi_ncr", "hyderabad", "chennai", "pune", "other_in", "remote_in"],
  },
  {
    label: "Europe",
    values: ["london", "berlin", "amsterdam", "paris", "other_eu", "remote_eu"],
  },
  { label: "Global", values: ["remote_global", "other"] },
];

export const orgPublicProfileSchema = z.object({
  industry: z.enum(INDUSTRY_VALUES),
  stage: z.enum(STAGE_VALUES),
  size: z.enum(SIZE_VALUES),
  region: z.enum(REGION_VALUES),
  description: z.string().max(280).optional(),
  websiteUrl: z.string().url().optional().or(z.literal("")),
});

export type OrgPublicProfile = z.infer<typeof orgPublicProfileSchema>;

/**
 * Build the public-facing label string for a role/org.
 * "Series B fintech, Bengaluru"
 */
export function composePublicLabel(profile: OrgPublicProfile): string {
  const stage = STAGE_LABELS[profile.stage];
  const industry = INDUSTRY_LABELS[profile.industry].toLowerCase();
  const region = REGION_LABELS[profile.region];
  return `${stage} ${industry}, ${region}`;
}
