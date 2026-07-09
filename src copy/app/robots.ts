import type { MetadataRoute } from "next";

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3029";
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: ["/auth/", "/api/", "/(app)/"],
      },
    ],
    sitemap: `${appBaseUrl()}/sitemap.xml`,
  };
}
