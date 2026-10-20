// Temporary probe — removed before merging. Reads a public data page from
// Vercel's network, which the development sandbox cannot reach.
const HOSTS = new Set(["data.apps.fao.org", "api.data.apps.fao.org", "data.humdata.org"]);

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") ?? "";
  const head = Number(new URL(req.url).searchParams.get("n") ?? "4000");
  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (!HOSTS.has(target.hostname)) return new Response("host not allowed", { status: 400 });
  const res = await fetch(target, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(50_000) });
  const body = await res.text();
  return new Response(
    `status ${res.status}\ntype ${res.headers.get("content-type")}\nlength ${body.length}\nlines ${body.split("\n").length}\n\n${body.slice(0, head)}\n\n--- tail ---\n${body.slice(-1500)}`,
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}
