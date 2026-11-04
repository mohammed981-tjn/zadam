// Prints what each candidate price source answers, from a GitHub runner (backlog 176).
// The development container cannot reach these sites, so nothing here is guessed: the run's
// log is read first, and only then is a reader written against what it shows.
//
//   node scripts/probe-price-sources.mjs
const UA = "SudagriPrices/1.0 (+https://zadam-khaki.vercel.app)";
const KEYWORDS = /(بنك الخرطوم|الدولار|الموازي|شراء|بيع|سعر الصرف|دولار|USD|exchange|currency|rate)/i;

const strip = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n").map((l) => l.trim()).filter(Boolean);

async function get(url) {
  try {
    const res = await fetch(url, {
      headers: { accept: "text/html,application/json", "user-agent": UA },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    const body = await res.text();
    return { status: res.status, type: res.headers.get("content-type"), url: res.url, body };
  } catch (e) {
    return { status: 0, type: "", url, body: "", error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

const wp = (base, search, days = 14) => {
  const after = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19);
  return `${base}/wp-json/wp/v2/posts?search=${encodeURIComponent(search)}&after=${after}&per_page=10&orderby=date&order=desc&_fields=id,date,link,title,content`;
};

const WP = [
  ["https://iqraa24.com", "بنك الخرطوم"],
  ["https://iqraa24.com", "الدولار"],
  ["https://bajnews.net", "الموازية"],
  ["https://bajnews.net", "الدولار"],
  ["https://sudafax.com", "سوق الأبيض"],
  ["https://sudafax.com", "القضارف"],
  ["https://alsudantoday.com", "سعر الدولار"],
  // 25 أكتوبر 2026 (البند ١٩٦): مرشَّحاتٌ جديدة للدولار، وللبورصتين. لا يُكتب قارئٌ لما لم يُرَ هنا.
  ["https://alghadalsudani.com", "الدولار"],
  ["https://alghadalsudani.com", "الجنيه"],
  ["https://alrakoba.net", "الدولار"],
  ["https://sudanile.com", "الدولار"],
  ["https://www.sudantribune.net", "الدولار"],
  ["https://www.dabangasudan.org", "الدولار"],
  ["https://sudanalaan.net", "بورصة"],
  ["https://ainelhagega.com", "بورصة"],
  ["https://tagpress.net", "بورصة"],
  ["https://alnilin.com", "بورصة"],
  ["https://sudanakhbar.com", "بورصة القضارف"],
  ["https://sudafax.com", "أسعار المحاصيل"],
];
const PAGES = [
  "https://iqraa24.com/",
  "https://www.bankofkhartoum.com/",
  "https://www.bankofkhartoum.com/exchange-rates",
  "https://www.bankofkhartoum.com/en/exchange-rates",
  "https://alsoug.com/currency",
  "https://alsoug.com/",
];

console.log(`probe at ${new Date().toISOString()}\n`);

for (const [base, q] of WP) {
  const url = wp(base, q);
  const r = await get(url);
  console.log(`=== WP ${base} «${q}» → ${r.status} ${r.type ?? ""} ${r.error ?? ""}`);
  if (r.status !== 200) { console.log(r.body.slice(0, 200).replace(/\s+/g, " ")); console.log(); continue; }
  let posts;
  try { posts = JSON.parse(r.body); } catch { console.log("not JSON:", r.body.slice(0, 200)); console.log(); continue; }
  console.log(`posts: ${Array.isArray(posts) ? posts.length : "not a list"}`);
  for (const p of Array.isArray(posts) ? posts : []) {
    const text = strip(p.content?.rendered ?? "");
    console.log(`- ${p.date} #${p.id} ${p.link}\n  title: ${p.title?.rendered}`);
    const hits = text.filter((l) => KEYWORDS.test(l)).slice(0, 6);
    for (const h of hits) console.log(`    | ${h.slice(0, 220)}`);
  }
  console.log();
}

for (const url of PAGES) {
  const r = await get(url);
  console.log(`=== PAGE ${url} → ${r.status} ${r.type ?? ""} final=${r.url} len=${r.body.length} ${r.error ?? ""}`);
  if (r.status !== 200) { console.log(r.body.slice(0, 200).replace(/\s+/g, " ")); console.log(); continue; }
  const lines = strip(r.body);
  console.log(`lines: ${lines.length}`);
  const hits = lines.filter((l) => KEYWORDS.test(l)).slice(0, 25);
  for (const h of hits) console.log(`  | ${h.slice(0, 220)}`);
  const links = [...r.body.matchAll(/href="([^"]+)"[^>]*>([^<]{0,80})</gi)]
    .filter((m) => /exchange|currency|rate|صرف|اسعار|أسعار|عملات/i.test(m[1] + m[2]))
    .slice(0, 12);
  for (const m of links) console.log(`  → ${m[1]}  «${m[2].trim()}»`);
  console.log();
}
