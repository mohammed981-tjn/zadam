// Temporary probe — removed before merging. Reads one WaPOR v3 pixel from
// Vercel's network, which the development sandbox cannot reach.
import { fromUrl } from "geotiff";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat") ?? "14.4");
  const lng = Number(q.get("lng") ?? "33.5");
  const codes = (q.get("d") ?? "2026-09-D2").split(",");
  const out: unknown[] = [];
  for (const d of codes) {
    const url = `https://storage.googleapis.com/fao-gismgr-wapor-3-data/DATA/WAPOR-3/MAPSET/L1-AETI-D/WAPOR-3.L1-AETI-D.${d}.tif`;
    const t0 = Date.now();
    try {
      const head = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (!head.ok) {
        out.push({ d, status: head.status });
        continue;
      }
      const tiff = await fromUrl(url);
      const img = await tiff.getImage();
      const [ox, oy] = img.getOrigin();
      const [rx, ry] = img.getResolution();
      const x = Math.floor((lng - ox) / rx);
      const y = Math.floor((lat - oy) / ry);
      const r = await img.readRasters({ window: [x, y, x + 1, y + 1] });
      out.push({
        d,
        ms: Date.now() - t0,
        raw: (r[0] as ArrayLike<number>)[0],
        nodata: img.getGDALNoData(),
        meta: img.getGDALMetadata(),
        size: [img.getWidth(), img.getHeight()],
        origin: [ox, oy],
        res: [rx, ry],
        bytes: head.headers.get("content-length"),
      });
    } catch (e) {
      out.push({ d, error: String(e) });
    }
  }
  return Response.json(out);
}
