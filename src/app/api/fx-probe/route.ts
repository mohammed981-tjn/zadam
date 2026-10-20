// Temporary probe — removed before merging. Runs the real WaPOR reader on
// Vercel's network, which the development sandbox cannot reach.
import { fromUrl } from "geotiff";
import { fetchLandWater } from "@/lib/wapor";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat") ?? "14.4");
  const lng = Number(q.get("lng") ?? "33.5");
  const t0 = Date.now();
  const rows = await fetchLandWater(lat, lng);
  const tiff = await fromUrl("https://storage.googleapis.com/fao-gismgr-wapor-3-data/DATA/WAPOR-3/MAPSET/L1-AETI-D/WAPOR-3.L1-AETI-D.2026-10-D1.tif");
  const img = await tiff.getImage();
  return Response.json({ ms: Date.now() - t0, rows, meta0: await img.getGDALMetadata(0), metaNull: await img.getGDALMetadata() });
}
