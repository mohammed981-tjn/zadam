// TEMPORARY: preview-only probe of exchange-rate sources. Removed before merge.
export async function GET() {
  const urls = [
    "https://khaligyoun.com/718449",
    "https://sudantribune.net/article/317824",
    "https://bankofkhartoum.com/sudan/",
  ];
  const out: string[] = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { "user-agent": "Mozilla/5.0" } });
      const t = (await r.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const i = Math.max(0, t.search(/دولار|USD|Dollar/));
      out.push(`== ${u} ${r.status}\n${t.slice(Math.max(0, i - 1500), i + 5000)}`);
    } catch (e) {
      out.push(`== ${u} ERROR ${String(e)}`);
    }
  }
  return new Response(out.join("\n\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
