/**
 * What each price source answers today, read by the site's own readers (the owner, 4 November 2026: «ابدأ» —
 * the feeds have brought nothing new for 9 to 21 days). Run on a GitHub runner, where the news sites are reachable:
 * for every source, how many articles the last 30 days hold, the newest few with their date and title, and what
 * each reader made of them (a figure, or nothing).
 *
 *   npx tsx scripts/probe-feeds-now.ts
 */
import { htmlToLines, readBank, readGedarefProse, readObeidList, readParallelMarket, type WpPost } from "../src/lib/priceFeeds";

const SOURCES: { base: string; search: string; read: (p: WpPost) => unknown; dump?: boolean }[] = [
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
  // 4 نوفمبر: مرشّحٌ لنشرة الأبيض نفسها (رصد إسماعيل جبال)، وجده البحث.
  { base: "https://nksnews.net", search: "بورصة", read: readObeidList },
  { base: "https://nksnews.net", search: "المحاصيل", read: readObeidList },
  { base: "https://elhadaf-sd.com", search: "القضارف", read: readGedarefProse },
  // 5 نوفمبر: مرشّحون للسوق الموازي (وجدهم البحث)، وبنك الخرطوم في المقالات نفسها.
  { base: "https://almndranews.com", search: "العملات", read: readParallelMarket, dump: true },
  { base: "https://almndranews.com", search: "العملات", read: readBank },
  { base: "https://alsudanalyoum.net", search: "الدولار", read: readParallelMarket, dump: true },
  { base: "https://alsudanalyoum.net", search: "الدولار", read: readBank },
  { base: "https://sudantomorrow.com", search: "السوق السوداء", read: readParallelMarket, dump: true },
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
      for (const p of body.slice(0, 8)) {
        const out = s.read(p);
        const read = Array.isArray(out) ? `${out.length} figures ${JSON.stringify(out.map((q) => [q.crop, q.unit, q.price, q.date]))}` : out ? JSON.stringify(out) : "nothing read";
        console.log(`   ${p.date.slice(0, 10)}  ${p.title.rendered.replace(/<[^>]+>/g, "").slice(0, 90)}\n      → ${read}`);
        // 5 نوفمبر: سطور الأسعار كما هي، والمقال كاملاً لصنع مثالٍ للفحص (fixture).
        if (s.dump && /دولار|العملات/u.test(p.title.rendered)) {
          for (const line of htmlToLines(p.content.rendered)) {
            if (/دولار/u.test(line) && /[\d٠-٩]{3}/u.test(line)) console.log(`      | ${line}`);
          }
          console.log(`DUMP ${JSON.stringify({ id: p.id, date: p.date, link: p.link, title: p.title, content: p.content })}`);
        }
      }
    } catch (e) {
      console.log(`   failed: ${(e as Error).message}`);
    }
  }
}
main();
