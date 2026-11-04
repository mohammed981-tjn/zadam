/**
 * What each price source answers today, read by the site's own readers (the owner, 4 November 2026: «ابدأ» —
 * the feeds have brought nothing new for 9 to 21 days). Run on a GitHub runner, where the news sites are reachable:
 * for every source, how many articles the last 30 days hold, the newest few with their date and title, and what
 * each reader made of them (a figure, or nothing).
 *
 *   npx tsx scripts/probe-feeds-now.ts
 */
import { readBank, readGedarefProse, readObeidList, readParallelMarket, type WpPost } from "../src/lib/priceFeeds";

const SOURCES: { base: string; search: string; read: (p: WpPost) => unknown }[] = [
  { base: "https://iqraa24.com", search: "بنك الخرطوم", read: readBank },
  { base: "https://bajnews.net", search: "بنك الخرطوم", read: readBank },
  { base: "https://bajnews.net", search: "الدولار", read: readBank },
  { base: "https://bajnews.net", search: "الموازية", read: readParallelMarket },
  { base: "https://alghadalsudani.com", search: "الدولار", read: readParallelMarket },
  { base: "https://sudafax.com", search: "سوق الأبيض", read: readObeidList },
  { base: "https://sudafax.com", search: "الأبيض", read: readObeidList },
  { base: "https://sudafax.com", search: "القضارف", read: readGedarefProse },
  { base: "https://sudafax.com", search: "بورصة", read: readObeidList },
  { base: "https://sudafax.com", search: "أسعار المحاصيل", read: readObeidList },
  { base: "https://sudafax.com", search: "الذرة", read: readGedarefProse },
];

async function main() {
  const after = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 19);
  for (const s of SOURCES) {
    const url = `${s.base}/wp-json/wp/v2/posts?search=${encodeURIComponent(s.search)}&after=${after}&per_page=10&orderby=date&order=desc&_fields=id,date,link,title,content`;
    console.log(`\n== ${s.base} «${s.search}»`);
    try {
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "SudagriPrices/1.0 (+https://zadam-khaki.vercel.app)" }, signal: AbortSignal.timeout(20_000) });
      console.log(`   HTTP ${res.status}`);
      if (!res.ok) continue;
      const body = (await res.json()) as WpPost[];
      console.log(`   ${body.length} posts in 30 days`);
      for (const p of body.slice(0, 6)) {
        const out = s.read(p);
        const read = Array.isArray(out) ? `${out.length} figures` : out ? JSON.stringify(out) : "nothing read";
        console.log(`   ${p.date.slice(0, 10)}  ${p.title.rendered.replace(/<[^>]+>/g, "").slice(0, 90)}\n      → ${read}`);
      }
    } catch (e) {
      console.log(`   failed: ${(e as Error).message}`);
    }
  }
}
main();
