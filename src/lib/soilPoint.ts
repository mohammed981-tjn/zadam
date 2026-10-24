/**
 * تربةُ نقطةِ الأرض نفسها (البند ١٨٠، MAP-1 من تقرير الفحص).
 *
 * `soilAt` (rainMap.ts) gives the soil of a 160 km map cell. In the Nile valley that is wrong: the
 * alluvium is a strip a few km wide in the middle of sand. This reads SoilGrids' WRB group at the
 * land's own coordinates (a 250 m pixel), with the probability SoilGrids gives it.
 *
 * It is still an estimate from satellites and models, never a soil test: the probability is kept
 * and shown, and below `SOIL_CONFIDENT_FROM` the page says «غير مؤكّد». At Khartoum on the Nile the
 * most probable group has 22 % (scripts/fixtures/soil-point); saying a class without that number
 * would be the same overstatement the cell map made, only smaller.
 *
 * The service needs no key, asks 5 queries a minute and answers in 3–6 seconds, so it is read when a
 * land's place or consent is saved, never when a page is drawn, and a failure leaves what was stored.
 */

export interface SoilEstimate {
  /** The most probable WRB group: `Vertisols`. */
  wrb: string;
  /** Its probability, 0–100. */
  probability: number;
  /** The groups after it, with theirs. */
  alternatives: { wrb: string; probability: number }[];
}

/** Below this the group is shown as unconfirmed. A policy of mine, not a measurement. */
export const SOIL_CONFIDENT_FROM = 40;

const GROUP = /^[A-Z][a-z]{3,20}$/;

/** SoilGrids' answer as a typed estimate; null for anything that is not a plain group with a number. */
export function parseSoilGridsClassification(body: unknown): SoilEstimate | null {
  const r = body as { wrb_class_name?: unknown; wrb_class_probability?: unknown } | null;
  if (!r || typeof r.wrb_class_name !== "string" || !GROUP.test(r.wrb_class_name)) return null;
  if (!Array.isArray(r.wrb_class_probability)) return null;
  const rows: { wrb: string; probability: number }[] = [];
  for (const row of r.wrb_class_probability) {
    if (!Array.isArray(row) || typeof row[0] !== "string" || typeof row[1] !== "number") continue;
    if (!GROUP.test(row[0]) || !Number.isFinite(row[1]) || row[1] < 0 || row[1] > 100) continue;
    rows.push({ wrb: row[0], probability: Math.round(row[1]) });
  }
  const top = rows.find((x) => x.wrb === r.wrb_class_name);
  if (!top) return null;
  return { wrb: top.wrb, probability: top.probability, alternatives: rows.filter((x) => x !== top).slice(0, 2) };
}

const ENDPOINT = "https://rest.isric.org/soilgrids/v2.0/classification/query";

/**
 * The estimate at a point, or null when the service cannot be read now (limit, outage, timeout, a
 * pixel with no information). Never throws: callers keep what they have.
 */
export async function fetchSoilAtPoint(
  longitude: number,
  latitude: number,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<SoilEstimate | null> {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  // Four decimals is about eleven metres: finer than the pixel, and a coordinate that need not travel whole.
  const url = `${ENDPOINT}?lon=${longitude.toFixed(4)}&lat=${latitude.toFixed(4)}&number_classes=3`;
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, {
      headers: { accept: "application/json", "user-agent": "Sudagri/1.0 (+https://zadam-khaki.vercel.app)" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseSoilGridsClassification(await res.json());
  } catch {
    return null;
  }
}

/** What to say beside a land's soil class, from where it came and how probable it is. */
export function soilEstimateWords(
  source: string | null | undefined,
  probability: number | null | undefined,
  t: (ar: string, en: string) => string,
): { label: string; confidence: string | null } {
  if (source !== "point") {
    return { label: t("التربة (تقدير للمنطقة، لا للحقل)", "Soil (an estimate for the area, not the field)"), confidence: null };
  }
  const label = t("التربة (تقدير من الأقمار لموقع الأرض)", "Soil (satellite estimate at the land's own point)");
  if (probability === null || probability === undefined) return { label, confidence: null };
  const confidence =
    probability >= SOIL_CONFIDENT_FROM
      ? t(`احتمال ${probability}٪`, `${probability}% probability`)
      : t(`غير مؤكّد — احتمال ${probability}٪ فقط`, `Unconfirmed — only ${probability}% probability`);
  return { label, confidence };
}
