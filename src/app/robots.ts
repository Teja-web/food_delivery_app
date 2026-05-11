import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/anonymize/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/opportunities/", "/opportunities"],
        disallow: ["/portal/", "/recruit/", "/auth/", "/api/"],
      },
    ],
    sitemap: `${appBaseUrl()}/sitemap.xml`,
  };
}
