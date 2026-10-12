// TEMPORARY: preview-only probe of exchange-rate sources. Removed before merge.
export async function GET() {
  const out: string[] = [];
  const page = await (await fetch("https://bankofkhartoum.com/sudan/currencies-exchange-rate", { cache: "no-store", headers: { "user-agent": "Mozilla/5.0" } })).text();
  const i = page.indexOf("Currencies Exchange Rate 2026");
  out.push(page.slice(Math.max(0, i - 500), i + 6000));
  const hrefs = [...page.matchAll(/href="([^"]+\.(?:pdf|xlsx?|png|jpe?g)[^"]*)"/gi)].map((m) => m[1]);
  out.push("FILES: " + JSON.stringify(hrefs.slice(0, 15)));
  const first = hrefs[0];
  if (first) {
    const r = await fetch(first.startsWith("http") ? first : `https://bankofkhartoum.com${first}`, { cache: "no-store", headers: { "user-agent": "Mozilla/5.0" } });
    out.push(`FIRST ${first} ${r.status} ${r.headers.get("content-type")} ${r.headers.get("content-length")}`);
  }
  return new Response(out.join("\n\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
