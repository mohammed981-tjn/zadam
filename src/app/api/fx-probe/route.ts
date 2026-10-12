// TEMPORARY: preview-only probe of exchange-rate sources. Removed before merge.
export async function GET() {
  const page = await (await fetch("https://bankofkhartoum.com/sudan/currencies-exchange-rate", { cache: "no-store", headers: { "user-agent": "Mozilla/5.0" } })).text();
  const i = page.search(/September\s*<\/?|23 September|September 23/);
  const j = page.search(/October/);
  return new Response(`len=${page.length} i=${i} oct=${j}\n` + page.slice(Math.max(0, (j > 0 ? j : i) - 2500), (j > 0 ? j : i) + 3500), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
