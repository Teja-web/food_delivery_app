import type { MetadataRoute } from "next";

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3029";
}

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appBaseUrl();
  return [
    {
      url: `${base}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
