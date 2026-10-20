import { unstable_cache } from "next/cache";
import { fromUrl } from "geotiff";

/**
 * «ماء أرضك من الأقمار الصناعيّة» — FAO WaPOR v3 (backlog 113, 115).
 *
 * WaPOR measures, every ten days and for every 300-metre square of Africa,
 * how much water actually left the ground: soil evaporation, the crop's own
 * transpiration and what the leaves intercepted (AETI). It is free and needs
 * no key; each ten-day map is one cloud-optimised GeoTIFF that can be read a
 * single pixel at a time, which is all a farm needs.
 *
 * Layer L1-AETI-D: mm per day, averaged over the dekad, released about five
 * days after it ends (FAO catalogue, linked below). The scale factor is read
 * from the file; the catalogue's 0.1 is the fallback only if a file lacks it.
 */

export const WAPOR_PORTAL = "https://data.apps.fao.org/wapor/";
export const WAPOR_LAYER_URL = "https://data.apps.fao.org/catalog/dataset/fb52a8b9-3ec6-4120-8e7f-2d0bbe8e0e95";
const FILE = (dekad: string) =>
  `https://storage.googleapis.com/fao-gismgr-wapor-3-data/DATA/WAPOR-3/MAPSET/L1-AETI-D/WAPOR-3.L1-AETI-D.${dekad}.tif`;

/** The FAO catalogue's scale factor for L1-AETI-D, used only when a file does not carry its own. */
const CATALOGUE_SCALE = 0.1;
/** One feddan is 4,200 m², so one millimetre over it is 4.2 m³. */
export const M3_PER_MM_FEDDAN = 4.2;

/** "2026-10-D1" for the first ten days of October 2026. */
export const dekadOf = (d: Date) => {
  const day = d.getUTCDate();
  const n = day <= 10 ? 1 : day <= 20 ? 2 : 3;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-D${n}`;
};

/** Days in a dekad: ten for the first two, the month's remainder for the third. */
export function dekadDays(dekad: string): number {
  const m = /^(\d{4})-(\d{2})-D([123])$/.exec(dekad);
  if (!m) return 0;
  if (m[3] !== "3") return 10;
  const monthDays = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return monthDays - 20;
}

/** The n dekads that ended before `today`, newest first. */
export function recentDekads(today: Date, n: number): string[] {
  const out: string[] = [];
  // Step back to the last day of the previous dekad, then keep stepping.
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const day = d.getUTCDate();
  d.setUTCDate(day <= 10 ? 0 : day <= 20 ? 10 : 20);
  while (out.length < n) {
    out.push(dekadOf(d));
    const dd = d.getUTCDate();
    d.setUTCDate(dd > 20 ? 20 : dd > 10 ? 10 : 0);
  }
  return out;
}

export interface DekadWater {
  dekad: string;
  /** Actual evapotranspiration, mm per day, as WaPOR gives it. */
  mmPerDay: number;
  days: number;
  /** mm/day × days × 4.2 — the water that left one feddan in that dekad. */
  m3PerFeddan: number;
}

export const toDekadWater = (dekad: string, mmPerDay: number): DekadWater => {
  const days = dekadDays(dekad);
  return { dekad, mmPerDay, days, m3PerFeddan: Math.round(mmPerDay * days * M3_PER_MM_FEDDAN * 10) / 10 };
};

/** One pixel of one dekad; null when the dekad is not released yet or the pixel has no data. */
async function readPixel(dekad: string, lat: number, lng: number): Promise<number | null> {
  try {
    const tiff = await fromUrl(FILE(dekad));
    const img = await tiff.getImage();
    const [ox, oy] = img.getOrigin();
    const [rx, ry] = img.getResolution();
    const x = Math.floor((lng - ox) / rx);
    const y = Math.floor((lat - oy) / ry);
    if (x < 0 || y < 0 || x >= img.getWidth() || y >= img.getHeight()) return null;
    const raw = (await img.readRasters({ window: [x, y, x + 1, y + 1] }))[0] as ArrayLike<number>;
    const v = raw[0];
    const nodata = img.getGDALNoData();
    if (!Number.isFinite(v) || (nodata !== null && v === nodata) || v < 0) return null;
    const meta = (await img.getGDALMetadata(0)) ?? {};
    const scale = Number(meta.SCALE ?? meta.scale_factor ?? CATALOGUE_SCALE);
    return Math.round(v * (Number.isFinite(scale) && scale > 0 ? scale : CATALOGUE_SCALE) * 100) / 100;
  } catch {
    // A dekad not yet published answers 404; that is "not yet", not an error worth a log line.
    return null;
  }
}

async function readRecent(lat: number, lng: number, today: string): Promise<DekadWater[]> {
  const dekads = recentDekads(new Date(`${today}T12:00:00Z`), 7);
  const values = await Promise.all(dekads.map((d) => readPixel(d, lat, lng)));
  return dekads.flatMap((d, i) => (values[i] === null ? [] : [toDekadWater(d, values[i]!)]));
}

/**
 * The last six or seven dekads at one place, cached a day per 300-metre pixel
 * (coordinates rounded to three decimals) — the maps change every ten days,
 * and each read is a few seconds of range requests.
 */
export async function fetchLandWater(lat: number, lng: number, now = new Date()): Promise<DekadWater[]> {
  const la = Math.round(lat * 1000) / 1000;
  const lo = Math.round(lng * 1000) / 1000;
  const today = now.toISOString().slice(0, 10);
  return unstable_cache(() => readRecent(la, lo, today), ["wapor-aeti", String(la), String(lo), today], { revalidate: 86_400 })();
}
