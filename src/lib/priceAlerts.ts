import type { SupabaseClient } from "@supabase/supabase-js";
import { cropName, money, UNIT_NAME, type MarketUnit, type PriceSeries } from "@/lib/marketCrops";
import type { FxReference } from "@/lib/fxRates";
import type { MarketPrices } from "@/lib/marketPrices";
import { currentFx, currentMarketPrices } from "@/lib/livePrices";
import { pushToUser } from "@/lib/push";
import { dbMessage } from "@/lib/dbMessages";
import { tr, type Locale } from "@/lib/i18n";

/**
 * تنبيهُ سعرٍ تحدّده بنفسك (البند ١٦٦): «فولٌ في الأبيض فوق كذا».
 *
 * A person sets a limit on one price — a crop in a market, or the bank's or the parallel
 * market's dollar. When the newest published figure crosses it the platform writes a
 * notification (and pushes it to the phone, if that is on) once, and the alert closes.
 *
 * WHAT COUNTS AS CROSSING
 *
 *   - The newest figure only. An older figure in the history never fires an alert.
 *   - Only a figure dated on or after the day the alert was set. A price that was already
 *     past the limit when it was set is refused at the form (`alreadyPast`) and, were one
 *     to slip through, would still fire only on the next *new* figure, not on yesterday's.
 *   - Strictly past the limit: equal to it does not fire.
 *   - Crops use the bourse's price; the dollar uses the *selling* price, as /rates leads with.
 *
 * Everything here that decides is pure; the one function that writes is `evaluatePriceAlerts`.
 */

export const MAX_ACTIVE_ALERTS = 10;

export type AlertSubject = "crop" | "fx_bank" | "fx_parallel";
export type AlertDirection = "above" | "below";

export interface PriceAlert {
  id: string;
  userId: string;
  subject: AlertSubject;
  market: string | null;
  crop: string | null;
  unit: string | null;
  direction: AlertDirection;
  threshold: number;
  /** The day the alert was set, YYYY-MM-DD. */
  createdOn: string;
}

/** The newest figure a subject has: its price and the market day it carries. */
export interface Figure {
  price: number;
  date: string;
}

export interface Figures {
  crops: Map<string, Figure>;
  fx_bank: Figure | null;
  fx_parallel: Figure | null;
}

export const cropFigureKey = (market: string, crop: string, unit: string) => `${market}:${crop}:${unit}`;

/** The newest figure of every series and of both dollars, from what the pages show. */
export function figuresOf(prices: MarketPrices | null, fx: FxReference | null): Figures {
  const crops = new Map<string, Figure>();
  for (const s of prices?.series ?? []) {
    const last = s.history.at(-1);
    if (last) crops.set(cropFigureKey(s.market, s.crop, s.unit), { price: last.price, date: last.date });
  }
  return {
    crops,
    fx_bank: fx ? { price: fx.bank.sell, date: fx.bank.date } : null,
    fx_parallel: fx ? { price: fx.parallel.sell, date: fx.parallel.date } : null,
  };
}

export function figureFor(a: Pick<PriceAlert, "subject" | "market" | "crop" | "unit">, figures: Figures): Figure | null {
  if (a.subject === "crop") return figures.crops.get(cropFigureKey(a.market ?? "", a.crop ?? "", a.unit ?? "")) ?? null;
  return figures[a.subject];
}

export const crossed = (direction: AlertDirection, price: number, threshold: number) =>
  direction === "above" ? price > threshold : price < threshold;

/** Whether the figure is already past the limit — the form refuses such an alert. */
export const alreadyPast = (direction: AlertDirection, price: number, threshold: number) => crossed(direction, price, threshold);

/** The alerts a set of figures fires, each with the figure that fired it. */
export function dueAlerts(alerts: PriceAlert[], figures: Figures): { alert: PriceAlert; figure: Figure }[] {
  const due: { alert: PriceAlert; figure: Figure }[] = [];
  for (const alert of alerts) {
    const figure = figureFor(alert, figures);
    if (!figure) continue;
    if (figure.date < alert.createdOn) continue;
    if (!crossed(alert.direction, figure.price, alert.threshold)) continue;
    due.push({ alert, figure });
  }
  return due;
}

// ── الكلام ─────────────────────────────────────────────────────────────────

export function subjectName(a: Pick<PriceAlert, "subject" | "market" | "crop">, markets: MarketPrices["markets"] | null): string {
  if (a.subject === "fx_bank") return "الدولار في بنك الخرطوم";
  if (a.subject === "fx_parallel") return "الدولار في السوق الموازي";
  const place = markets?.[a.market ?? ""]?.name_ar ?? a.market ?? "";
  return `${cropName(a.crop ?? "", "ar")} في ${place}`;
}

export function unitSuffix(a: Pick<PriceAlert, "subject" | "unit">): string {
  if (a.subject !== "crop") return "جنيه";
  const u = UNIT_NAME[(a.unit ?? "") as MarketUnit];
  return u ? `جنيه لل${u.ar.slice(2)}` : "جنيه";
}

export function alertText(a: PriceAlert, figure: Figure, markets: MarketPrices["markets"] | null): { title: string; body: string } {
  const what = subjectName(a, markets);
  const word = a.direction === "above" ? "فوق" : "تحت";
  return {
    title: `${what} صار ${word} ${money(a.threshold)}`,
    body: `آخر سعرٍ منشور ${money(figure.price)} ${unitSuffix(a)} (بتاريخ ${figure.date}). وضعتَ هذا التنبيه ليُنبّهك حين يصير السعر ${word} ${money(a.threshold)}، وقد أُغلق الآن.`,
  };
}

export function describeAlert(a: PriceAlert, markets: MarketPrices["markets"] | null): string {
  return `${subjectName(a, markets)} ${a.direction === "above" ? "فوق" : "تحت"} ${money(a.threshold)} ${unitSuffix(a)}`;
}

// ── القاعدة ─────────────────────────────────────────────────────────────────

interface AlertRow {
  id: string;
  user_id: string;
  subject: AlertSubject;
  market: string | null;
  crop: string | null;
  unit: string | null;
  direction: AlertDirection;
  threshold: number | string;
  created_at: string;
}

export const toAlert = (r: AlertRow): PriceAlert => ({
  id: r.id,
  userId: r.user_id,
  subject: r.subject,
  market: r.market,
  crop: r.crop,
  unit: r.unit,
  direction: r.direction,
  threshold: Number(r.threshold),
  // The day in Khartoum, which is the day the bourse's figures are dated in.
  createdOn: new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" }),
});

export interface AlertRun {
  checked: number;
  fired: number;
  pushed: number;
}

/**
 * Reads every active alert, fires those the newest figures cross, and pushes each to the phone.
 * Safe to run any number of times a day: the database closes an alert as it fires it, so a second
 * run finds nothing to fire. A failure is logged and returned as zeros; it never throws.
 */
export async function evaluatePriceAlerts(admin: SupabaseClient): Promise<AlertRun> {
  const none: AlertRun = { checked: 0, fired: 0, pushed: 0 };
  try {
    const { data, error } = await admin
      .from("price_alerts")
      .select("id, user_id, subject, market, crop, unit, direction, threshold, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(5000);
    if (error) {
      console.error("price-alerts: read", error);
      return none;
    }
    const alerts = ((data ?? []) as AlertRow[]).map(toAlert);
    if (alerts.length === 0) return none;

    const [prices, fx] = await Promise.all([currentMarketPrices(), currentFx()]);
    const due = dueAlerts(alerts, figuresOf(prices, fx));

    let fired = 0;
    let pushed = 0;
    for (const { alert, figure } of due) {
      const text = alertText(alert, figure, prices?.markets ?? null);
      const link = alert.subject === "crop" ? `/market#${alert.market}:${alert.crop}` : "/rates";
      const { data: ok, error: fireError } = await admin.rpc("price_alert_fire", {
        p_id: alert.id,
        p_value: figure.price,
        p_market_date: figure.date,
        p_title: text.title,
        p_body: text.body,
        p_link: link,
      });
      if (fireError) {
        console.error("price-alerts: fire", alert.id, fireError);
        continue;
      }
      if (ok !== true) continue;
      fired++;
      // To the phone too, for whoever turned that on; a failed push changes nothing.
      const p = await pushToUser(admin, alert.userId, { title: text.title, body: text.body, url: link });
      pushed += p.sent;
    }
    return { checked: alerts.length, fired, pushed };
  } catch (e) {
    console.error("price-alerts: run failed", e);
    return none;
  }
}

/** The subjects the form offers: those that have a published figure to be measured against. */
export function subjectOptions(series: PriceSeries[], markets: MarketPrices["markets"], figures: Figures) {
  const options: { value: string; label: string; unit: string; price: number; date: string }[] = [];
  for (const s of series) {
    const f = figures.crops.get(cropFigureKey(s.market, s.crop, s.unit));
    if (!f) continue;
    options.push({
      value: `crop|${s.market}|${s.crop}|${s.unit}`,
      label: `${cropName(s.crop, "ar")} — ${markets[s.market]?.name_ar ?? s.market}`,
      unit: unitSuffix({ subject: "crop", unit: s.unit }),
      price: f.price,
      date: f.date,
    });
  }
  if (figures.fx_bank) options.push({ value: "fx_bank|||", label: "الدولار — بنك الخرطوم", unit: "جنيه", ...figures.fx_bank });
  if (figures.fx_parallel) options.push({ value: "fx_parallel|||", label: "الدولار — السوق الموازي", unit: "جنيه", ...figures.fx_parallel });
  return options;
}

/** `crop|obeid|groundnut|qintar` or `fx_bank|||` back into the parts; null when it is neither. */
export function parseSubject(raw: string): Pick<PriceAlert, "subject" | "market" | "crop" | "unit"> | null {
  const [subject, market, crop, unit] = raw.split("|");
  if (subject === "fx_bank" || subject === "fx_parallel") return { subject, market: null, crop: null, unit: null };
  if (subject === "crop" && market && crop && unit) return { subject, market, crop, unit };
  return null;
}

// ── ما يقرؤه صاحب التنبيهات ويكتبه — للموقع والتطبيق معاً (البند ٢٠٣) ─────────────────

/** «600,000» and «٦٠٠٠٠٠» are both ways a person writes a limit. Null when it is not a usable limit in pounds. */
export function parseThreshold(input: string): number | null {
  const raw = input.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[,٬\s]/g, "");
  const threshold = Number(raw);
  if (!raw || !Number.isFinite(threshold) || threshold <= 0 || threshold > 100_000_000_000) return null;
  return threshold;
}

export interface AlertOutcome {
  ok: boolean;
  message: string;
}

/**
 * Adds an alert for whoever `supabase` acts as — the website's session client or the app's bearer client — with the
 * same checks in the same order the form always made: a known subject, a direction, a limit in pounds, a published
 * figure to measure it against, and not a limit the price is already past (it would fire on the next new figure for
 * nothing). The database then holds the owner and the cap on running alerts (`price_alert_create`).
 */
export async function createPriceAlertFor(
  supabase: SupabaseClient,
  input: { subject: string; direction: string; threshold: string },
  locale: Locale,
): Promise<AlertOutcome> {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const subject = parseSubject(input.subject);
  const direction = input.direction as AlertDirection;
  const threshold = parseThreshold(input.threshold);

  if (!subject) return { ok: false, message: t("اختر ما تريد متابعة سعره.", "Choose the price you want to follow.") };
  if (direction !== "above" && direction !== "below") {
    return { ok: false, message: t("اختر: حين يصير السعر فوق الحدّ أو تحته.", "Choose: when the price goes above or below the limit.") };
  }
  if (threshold === null) return { ok: false, message: t("اكتب سعراً صحيحاً بالجنيه.", "Enter a valid price in pounds.") };

  const [prices, fx] = await Promise.all([currentMarketPrices(), currentFx()]);
  const figure = figureFor(subject, figuresOf(prices, fx));
  if (!figure) {
    return { ok: false, message: t("لا يوجد سعرٌ منشور لهذا الصنف الآن، فلا يمكن متابعته.", "There is no published price for this item right now, so it cannot be followed.") };
  }
  if (alreadyPast(direction, figure.price, threshold)) {
    return {
      ok: false,
      message: t(
        `السعر الآن ${money(figure.price)} وهو ${direction === "above" ? "فوق" : "تحت"} ${money(threshold)} أصلاً. اختر حدّاً ${direction === "above" ? "أعلى" : "أدنى"} منه.`,
        `The price is already ${money(figure.price)}, ${direction === "above" ? "above" : "below"} ${money(threshold)}. Choose a limit ${direction === "above" ? "higher" : "lower"} than that.`,
      ),
    };
  }

  const { error } = await supabase.rpc("price_alert_create", {
    p_subject: subject.subject,
    p_market: subject.market,
    p_crop: subject.crop,
    p_unit: subject.unit,
    p_direction: direction,
    p_threshold: threshold,
  });
  if (error) {
    const why = dbMessage(error.message, locale);
    return { ok: false, message: t(`تعذّر إضافة التنبيه: ${why}`, `Could not add the alert: ${why}`) };
  }
  return {
    ok: true,
    message: t(
      `أضفنا التنبيه. سيصلك إشعارٌ حين يتجاوز آخر سعرٍ منشور هذا الحدّ (الأقصى ${MAX_ACTIVE_ALERTS} تنبيهات شغّالة).`,
      `Alert added. You will get a notification when the latest published price passes this limit (up to ${MAX_ACTIVE_ALERTS} running alerts).`,
    ),
  };
}

/** Stops one of the caller's running alerts; it is not deleted, it stays on record as stopped. The error text, or null. */
export async function stopPriceAlertFor(supabase: SupabaseClient, id: string, locale: Locale): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return tr(locale, "تنبيهٌ غير معروف.", "Unknown alert.");
  const { error } = await supabase.rpc("price_alert_stop", { p_id: id });
  return error ? dbMessage(error.message, locale) : null;
}

export interface PriceAlertRow {
  id: string;
  user_id: string;
  subject: PriceAlert["subject"];
  market: string | null;
  crop: string | null;
  unit: string | null;
  direction: PriceAlert["direction"];
  threshold: number | string;
  created_at: string;
  status: "active" | "fired" | "stopped";
  settled_at: string | null;
  fired_value: number | string | null;
  fired_market_date: string | null;
}

/**
 * The caller's alerts, newest first, and the subjects the form may offer. The policy lets each person read only their
 * own rows, so the same query serves the website's session client and the app's bearer client.
 */
export async function loadPriceAlerts(supabase: SupabaseClient) {
  const [{ data }, prices, fx] = await Promise.all([
    supabase
      .from("price_alerts")
      .select("id, user_id, subject, market, crop, unit, direction, threshold, created_at, status, settled_at, fired_value, fired_market_date")
      .order("created_at", { ascending: false })
      .limit(100),
    currentMarketPrices(),
    currentFx(),
  ]);
  const rows = (data ?? []) as PriceAlertRow[];
  const markets = prices?.markets ?? null;
  const options = subjectOptions(prices?.series ?? [], markets ?? {}, figuresOf(prices, fx));
  const running = rows.filter((r) => r.status === "active");
  const settled = rows.filter((r) => r.status !== "active");
  return { rows, markets, options, running, settled };
}
