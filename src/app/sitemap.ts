import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * خريطةُ الموقع — ما يُفتح للزائر بلا حسابٍ فقط.
 *
 * WHY A HAND-WRITTEN LIST AND NOT A CRAWL OF `src/app`
 *
 * Half the routes in this app redirect an anonymous visitor to `/login`
 * (`/lands`, `/seasons`, `/export/offers`, `/mining/registry` …). Listing them
 * would hand Google a page it can only ever see as a login form, and it would
 * index that form under the platform's name. So a route enters this list only
 * when it renders its real content to someone who has never signed in — the
 * same test the homepage board applies to its tiles.
 *
 * WHY NO DATABASE ROWS
 *
 * Project pages exist, but none is published for investment yet, and a sitemap
 * that queries production at build time turns every deploy into a database
 * client. When a project is published, add its route here or make this async —
 * not before there is something to list.
 */
const PUBLIC_ROUTES: {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}[] = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/knowledge", priority: 0.9, changeFrequency: "weekly" },
  { path: "/rain", priority: 0.9, changeFrequency: "daily" },
  { path: "/nafir", priority: 0.8, changeFrequency: "daily" },
  { path: "/nafir/charter", priority: 0.7, changeFrequency: "weekly" },
  { path: "/nafir/faza", priority: 0.7, changeFrequency: "daily" },
  { path: "/nafir/shura", priority: 0.6, changeFrequency: "daily" },
  { path: "/tools/water", priority: 0.9, changeFrequency: "monthly" },
  { path: "/tools/feasibility", priority: 0.8, changeFrequency: "monthly" },
  { path: "/arc-canal", priority: 0.8, changeFrequency: "monthly" },
  { path: "/studies", priority: 0.7, changeFrequency: "monthly" },
  { path: "/studies/exchange-rate", priority: 0.7, changeFrequency: "monthly" },
  { path: "/export", priority: 0.8, changeFrequency: "monthly" },
  { path: "/export/market", priority: 0.7, changeFrequency: "monthly" },
  { path: "/services", priority: 0.7, changeFrequency: "weekly" },
  { path: "/how-we-work", priority: 0.7, changeFrequency: "monthly" },
  { path: "/partners", priority: 0.6, changeFrequency: "weekly" },
  { path: "/mining", priority: 0.6, changeFrequency: "monthly" },
  { path: "/news", priority: 0.6, changeFrequency: "weekly" },
  { path: "/projects", priority: 0.5, changeFrequency: "weekly" },
  { path: "/guide", priority: 0.5, changeFrequency: "monthly" },
  { path: "/signup", priority: 0.4, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
