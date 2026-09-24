import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * ما لا يُفهرَس: الإدارةُ والواجهاتُ البرمجيّة ومساراتُ الدخول.
 *
 * This is a courtesy to crawlers, not a lock — every route below is guarded by
 * RLS and by its own server-side check, and would be exactly as safe with no
 * robots file at all. It exists so that search results show the platform's
 * pages rather than its login form and its admin shell.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/auth", "/dashboard", "/reset", "/notifications"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
