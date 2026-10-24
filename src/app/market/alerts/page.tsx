import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { loginTo } from "@/lib/authEntry";
import { currentFx, currentMarketPrices } from "@/lib/livePrices";
import { MAX_ACTIVE_ALERTS, describeAlert, figuresOf, subjectOptions, toAlert, type PriceAlert } from "@/lib/priceAlerts";
import { money } from "@/lib/marketCrops";
import PageHeader from "@/components/PageHeader";
import PriceAlertForm from "@/components/PriceAlertForm";
import { card, ghost } from "@/lib/ui";
import { stopPriceAlert } from "./actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "تنبيهات الأسعار | سوداقري", "Price alerts | Sudagri") };
}

interface Row {
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
 * «تنبيهُ سعرٍ تحدّده بنفسك» (البند ١٦٦): حدٌّ فوق سعر محصولٍ أو الدولار أو تحته، فيصلك إشعارٌ
 * مرّةً واحدة حين يتجاوزه آخر سعرٍ منشور. لا يقرأ هذه الصفحة إلا صاحبها (السياسة في القاعدة).
 */
export default async function PriceAlertsPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/market/alerts"));

  const [{ data }, prices, fx] = await Promise.all([
    supabase
      .from("price_alerts")
      .select("id, user_id, subject, market, crop, unit, direction, threshold, created_at, status, settled_at, fired_value, fired_market_date")
      .order("created_at", { ascending: false })
      .limit(100),
    currentMarketPrices(),
    currentFx(),
  ]);
  const rows = (data ?? []) as Row[];
  const markets = prices?.markets ?? null;
  const options = subjectOptions(prices?.series ?? [], markets ?? {}, figuresOf(prices, fx));
  const running = rows.filter((r) => r.status === "active");
  const settled = rows.filter((r) => r.status !== "active");
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", { dateStyle: "medium" });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/market" className="text-sm text-primary underline">
        {t("← سوق المحاصيل", "← Crop market")}
      </Link>
      <div className="mt-3">
        <PageHeader icon="chart" eyebrow={t("تنبيهات الأسعار", "Price alerts")} title={t("نبّهني حين يتغيّر السعر", "Tell me when the price moves")}>
          {t(
            "ضع حدّاً لسعر محصولٍ أو للدولار. حين يتجاوزه آخر سعرٍ منشور يصلك إشعارٌ مرّةً واحدة (وعلى شاشة هاتفك إن فعّلت تنبيهات الهاتف من صفحة الإشعارات). الأسعار تُنشر حين تصدر نشراتها، فقد يتأخّر التنبيه عن السوق نفسه.",
            "Set a limit on a crop price or on the dollar. When the latest published price passes it you get a notification once (and on your phone's screen if you turned phone alerts on from the notifications page). Prices are published when their bulletins appear, so an alert can lag the market itself.",
          )}
        </PageHeader>
      </div>

      <section className={card}>
        <h2 className="text-base font-bold">{t("تنبيهٌ جديد", "A new alert")}</h2>
        {running.length >= MAX_ACTIVE_ALERTS ? (
          <p className="mt-2 text-sm text-danger">
            {t(`عندك ${MAX_ACTIVE_ALERTS} تنبيهات شغّالة، وهذا الحدّ الأقصى. أوقف واحداً لتضيف غيره.`, `You have ${MAX_ACTIVE_ALERTS} running alerts, the maximum. Stop one to add another.`)}
          </p>
        ) : options.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("لا أسعار منشورة الآن لنتابعها.", "There are no published prices to follow right now.")}</p>
        ) : (
          <PriceAlertForm options={options} />
        )}
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="text-base font-bold">{t("تنبيهاتك الشغّالة", "Your running alerts")}</h2>
        {running.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("لا تنبيهات شغّالة.", "No running alerts.")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {running.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="text-sm">
                  <div className="font-bold" dir="auto">{describeAlert(toAlert(r), markets)}</div>
                  <div className="text-xs text-muted">{t("أُضيف", "Added")} {day(r.created_at)}</div>
                </div>
                <form action={stopPriceAlert}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className={ghost}>{t("أوقف", "Stop")}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settled.length > 0 && (
        <section className={`${card} mt-4`}>
          <h2 className="text-base font-bold">{t("ما انتهى", "Finished")}</h2>
          <ul className="mt-2 divide-y divide-border">
            {settled.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <div className="font-bold" dir="auto">{describeAlert(toAlert(r), markets)}</div>
                <div className="text-xs text-muted">
                  {r.status === "fired"
                    ? t(
                        `أُطلق بسعر ${money(Number(r.fired_value))} بتاريخ ${r.fired_market_date ?? ""}`,
                        `Fired at ${money(Number(r.fired_value))} on ${r.fired_market_date ?? ""}`,
                      )
                    : t(`أوقفتَه ${r.settled_at ? day(r.settled_at) : ""}`, `You stopped it ${r.settled_at ? day(r.settled_at) : ""}`)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
