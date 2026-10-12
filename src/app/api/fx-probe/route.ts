// TEMPORARY: preview-only probe of exchange-rate sources. Removed before merge.
export async function GET() {
  const out: string[] = [];
  try {
    const home = await (await fetch("https://bankofkhartoum.com/sudan/", { cache: "no-store", headers: { "user-agent": "Mozilla/5.0" } })).text();
    const links = [...home.matchAll(/href="([^"]+)"[^>]*>[^<]*(?:<[^>]+>)*[^<]*Rate/gi)].map((m) => m[1]);
    const near = [...home.matchAll(/href="([^"]*(?:rate|Rate|exchange)[^"]*)"/g)].map((m) => m[1]);
    out.push("links: " + JSON.stringify([...new Set([...links, ...near])].slice(0, 30)));
    for (const u of [...new Set(near)].slice(0, 4)) {
      try {
        const r = await fetch(u.startsWith("http") ? u : `https://bankofkhartoum.com${u}`, { cache: "no-store", headers: { "user-agent": "Mozilla/5.0" } });
        const t = (await r.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        const i = Math.max(0, t.search(/USD|Dollar|دولار/));
        out.push(`== ${u} ${r.status}\n${t.slice(Math.max(0, i - 800), i + 2500)}`);
      } catch (e) { out.push(`== ${u} ERROR ${String(e)}`); }
    }
  } catch (e) { out.push("home ERROR " + String(e)); }
  return new Response(out.join("\n\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
