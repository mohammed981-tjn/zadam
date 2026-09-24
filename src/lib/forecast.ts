import type { StationClimate } from "./agronomy";

/**
 * توقّعُ الأسبوع لكل محطة — المطرُ والبخرُ-نتحُ المرجعيّ، من Open-Meteo.
 *
 * WHY THIS EXISTS BESIDE A CALCULATOR THAT ALREADY HAS RAIN IN IT
 *
 * The water calculator plans a *season* from monthly means: how much a feddan
 * of wheat needs in Gezira in a typical January. That answers "how big a pump",
 * not "do I irrigate this week". A farmer standing in the field asks the
 * second, and the answer depends on the rain actually forecast, not the rain
 * that falls on average. So this adds the week ahead, next to the plan.
 *
 * WHY ET0 AND NOT JUST RAIN
 *
 * Twenty millimetres of rain means little in a week when the air takes fifty,
 * and a lot in a week when it takes fifteen. Open-Meteo publishes a daily FAO-56
 * reference evapotranspiration — the same quantity the calculator is built on —
 * so the two can be put side by side and the rain read as a share of the
 * demand, which is the number a decision can rest on.
 *
 * WHAT THIS DELIBERATELY DOES NOT SAY
 *
 * It does not tell anyone to skip an irrigation. Forecast rain is a
 * probability, effective rain is less than total rain, and a crop's demand is
 * ET0 times its own coefficient. So it reports the ratio plainly and leaves the
 * decision where it belongs. The verdict bands below describe the week, not the
 * field.
 *
 * LICENCE
 *
 * Open-Meteo's free API is for non-commercial use. If the platform starts
 * charging for this, the terms change — see https://open-meteo.com/en/pricing.
 */

export interface ForecastDay {
  date: string;
  rainMm: number;
  et0Mm: number;
  tmaxC: number;
}

export interface WeekSummary {
  rainMm: number;
  et0Mm: number;
  /** المطرُ المتوقّع نسبةً من البخر-نتح المرجعيّ للأسبوع، 0–∞. */
  rainShare: number;
  tmaxC: number;
  /** أوّلُ يومٍ فيه مطرٌ يُعتدّ به، أو null. */
  firstRainDay: string | null;
  band: "dry" | "some" | "wet";
}

/** Below this a day's rain is noise for irrigation purposes. */
export const MEANINGFUL_RAIN_MM = 5;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summariseWeek(days: ForecastDay[]): WeekSummary | null {
  if (days.length === 0) return null;
  const rainMm = round1(days.reduce((a, d) => a + d.rainMm, 0));
  const et0Mm = round1(days.reduce((a, d) => a + d.et0Mm, 0));
  const rainShare = et0Mm > 0 ? rainMm / et0Mm : 0;
  const tmaxC = Math.max(...days.map((d) => d.tmaxC));
  const firstRainDay =
    days.find((d) => d.rainMm >= MEANINGFUL_RAIN_MM)?.date ?? null;
  const band: WeekSummary["band"] =
    rainShare >= 0.5 ? "wet" : rainMm >= MEANINGFUL_RAIN_MM ? "some" : "dry";
  return { rainMm, et0Mm, rainShare, tmaxC, firstRainDay, band };
}

export const BAND_LABEL: Record<WeekSummary["band"], string> = {
  dry: "لا مطر يُعتدّ به — الريّ على جدوله",
  some: "مطرٌ قليل — لا يغطّي حاجة الأسبوع",
  wet: "مطرٌ يغطّي نصف الحاجة أو أكثر — راقب قبل الريّ",
};

interface OpenMeteoLocation {
  daily?: {
    time?: string[];
    precipitation_sum?: (number | null)[];
    et0_fao_evapotranspiration?: (number | null)[];
    temperature_2m_max?: (number | null)[];
  };
}

/**
 * Turns Open-Meteo's response into days per location.
 *
 * With several coordinates the API returns a JSON *list*, one object per
 * location in request order; with one it returns a bare object. Both are
 * accepted so a single-station call cannot silently break the parser.
 * A day with any missing value is dropped rather than read as zero — a null
 * rain figure is "unknown", and zero rain is a claim.
 */
export function parseOpenMeteo(json: unknown): ForecastDay[][] {
  const list = (Array.isArray(json) ? json : [json]) as OpenMeteoLocation[];
  return list.map((loc) => {
    const d = loc?.daily;
    if (!d?.time) return [];
    const out: ForecastDay[] = [];
    d.time.forEach((date, i) => {
      const rain = d.precipitation_sum?.[i];
      const et0 = d.et0_fao_evapotranspiration?.[i];
      const tmax = d.temperature_2m_max?.[i];
      if (rain == null || et0 == null || tmax == null) return;
      out.push({ date, rainMm: rain, et0Mm: et0, tmaxC: tmax });
    });
    return out;
  });
}

export function forecastUrl(stations: Pick<StationClimate, "latitude" | "longitude">[]): string {
  const p = new URLSearchParams({
    latitude: stations.map((s) => s.latitude).join(","),
    longitude: stations.map((s) => s.longitude).join(","),
    daily: "precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max",
    timezone: "Africa/Khartoum",
    forecast_days: "7",
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

/**
 * One request for every station, cached for three hours.
 *
 * Returns null on any failure: the forecast is an addition to the water page,
 * and a network error on a third-party API must never take the calculator
 * down with it.
 */
export async function fetchWeekForecast(
  stations: StationClimate[],
): Promise<Map<string, WeekSummary> | null> {
  try {
    const res = await fetch(forecastUrl(stations), {
      next: { revalidate: 10_800 },
    });
    if (!res.ok) {
      console.error("forecast: Open-Meteo answered", res.status);
      return null;
    }
    const perStation = parseOpenMeteo(await res.json());
    const out = new Map<string, WeekSummary>();
    stations.forEach((s, i) => {
      const w = summariseWeek(perStation[i] ?? []);
      if (w) out.set(s.key, w);
    });
    return out.size > 0 ? out : null;
  } catch (e) {
    console.error("forecast: request failed", e);
    return null;
  }
}
