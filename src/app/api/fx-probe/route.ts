// TEMPORARY: preview-only probe to see what the Central Bank of Sudan page returns. Removed before merge.
export async function GET() {
  const urls = [
    "https://cbos.gov.sd/ar/exchange-rates",
    "https://cbos.gov.sd/en/exchange-rates",
    "https://www.cbos.gov.sd/ar/exchange-rates",
  ];
  const out: string[] = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      const t = await r.text();
      const i = Math.max(0, t.search(/USD|دولار/));
      out.push(`== ${u} ${r.status} len=${t.length}\n${t.slice(Math.max(0, i - 3000), i + 4000)}`);
    } catch (e) {
      out.push(`== ${u} ERROR ${String(e)}`);
    }
  }
  return new Response(out.join("\n\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
