import type { MetadataRoute } from "next";
import { listPublicSlugs } from "@/operations/public";
import { appBaseUrl, opportunityUrl } from "@/lib/anonymize/seo";

export const revalidate = 3600; // regenerate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listPublicSlugs();
  const base = appBaseUrl();
  return [
    {
      url: `${base}/opportunities`,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    ...slugs.map((s) => ({
      url: opportunityUrl(s.slug),
      lastModified: s.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
