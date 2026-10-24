import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import ActionNotice from "@/components/ActionNotice";
import { cropName, UNIT_NAME } from "@/lib/marketPrices";
import { loadFeedStates, type FeedKey } from "@/lib/priceFreshness";
import { button, card, ghost } from "@/lib/ui";
import { reviewQuote, runPricesNow } from "./actions";

export const metadata = { title: "الأسعار | الإدارة | سوداقري" };

interface Quote {
  id: string;
  kind: "fx_bank" | "fx_parallel" | "crop";
  market: string;
  crop: string;
  unit: string | null;
  market_date: string;
  buy: number | null;
  sell: number | null;
  price: number | null;
  source_url: string;
  quote: string | null;
  status: "published" | "held" | "rejected";
  reason: string | null;
  created_at: string;
}

interface Run {
  id: string;
  started_at: string;
  finished_at: string | null;
  trigger: "cron" | "admin";
  found: number;
  published: number;
  held: number;
  errors: string[];
}

/**
 * الأسعار — شاشة الإدارة (البند ١٣١).
 *
 * The daily run reads the prices on its own; this is where an administrator
 * sees what it did, decides what it held, and can run it now.
 */
export default async function AdminPricesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as { role: string } | null)?.role !== "admin") redirect("/");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const n = (v: number | null) => (v === null ? "—" : Number(v).toLocaleString("en-US"));
  const when = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Khartoum" })
      : "—";

  const [{ data: heldRows, error }, { data: recentRows }, { data: runRows }] = await Promise.all([
    supabase.from("market_quotes").select("*").eq("status", "held").order("created_at", { ascending: false }).limit(100),
    supabase.from("market_quotes").select("*").eq("status", "published").order("created_at", { ascending: false }).limit(20),
    supabase.from("price_runs").select("*").order("started_at", { ascending: false }).limit(10),
  ]);
  const feeds = await loadFeedStates(supabase);
  const feedName: Record<FeedKey, string> = {
    fx_bank: t("سعر بنك الخرطوم", "Bank of Khartoum rate"),
    fx_parallel: t("سعر السوق الموازي", "Parallel-market rate"),
    crop_obeid: t("نشرة سوق الأبيض", "El Obeid bulletin"),
  };
  const held = (heldRows ?? []) as Quote[];
  const recent = (recentRows ?? []) as Quote[];
  const runs = (runRows ?? []) as Run[];

  const label = (q: Quote) =>
    q.kind === "fx_bank"
      ? t("الدولار — بنك الخرطوم", "Dollar — Bank of Khartoum")
      : q.kind === "fx_parallel"
        ? t("الدولار — السوق الموازي", "Dollar — parallel market")
        : `${cropName(q.crop, locale)} — ${q.market === "gedaref" ? t("القضارف", "Gedaref") : t("الأبيض", "El Obeid")}`;
  const figure = (q: Quote) =>
    q.kind === "crop"
      ? `${n(q.price)} ${t("جنيه", "SDG")} / ${q.unit ? (locale === "en" ? UNIT_NAME[q.unit as keyof typeof UNIT_NAME]?.en : UNIT_NAME[q.unit as keyof typeof UNIT_NAME]?.ar) ?? q.unit : ""}`
      : `${t("شراء", "buy")} ${n(q.buy)} · ${t("بيع", "sell")} ${n(q.sell)}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader icon="shield" eyebrow={t("الإدارة", "Administration")} title={t("الأسعار", "Prices")}>
        {t(
          "تقرأ المنصّة كلّ يوم سعر بنك الخرطوم والسوق الموازي ونشرات بورصتي الأبيض والقضارف من مواقع الأخبار، وتنشر كلّ رقمٍ برابطه وجملته. وما شذّ عن آخر رقمٍ أو جاء من نصٍّ حرّ يُحجز هنا لقرارك.",
          "Every day the platform reads Bank of Khartoum, the parallel market and the El Obeid and Gedaref bulletins from the news sites, and publishes each figure with its link and its sentence. What strays from the last figure, or comes from free prose, waits here for your decision.",
        )}
      </PageHeader>
      <ActionNotice ok={sp.ok} error={sp.error} />

      {error && (
        <p className={`${card} mb-6 text-sm text-muted`}>
          {t("تعمل هذه الشاشة بعد تطبيق هجرتها.", "This screen works once its migration is applied.")}
        </p>
      )}

      <section className="mb-8">
        <h2 className="title-bar mb-3 font-black">{t("حداثة الأسعار", "How fresh the prices are")}</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {feeds.map((f) => (
            <li key={f.key} className={`${card} flex flex-wrap items-center justify-between gap-2`}>
              <span className="font-bold">{feedName[f.key]}</span>
              <span className={f.stale ? "font-bold text-accent" : "text-muted"}>
                {f.newest
                  ? t(`آخر رقمٍ ${f.newest} · قبل ${f.ageDays} يوماً`, `Latest ${f.newest} · ${f.ageDays} days ago`)
                  : t("لا رقمَ منشور", "No figure published")}
                {f.stale &&
                  t(
                    ` — أقدم من الحدّ (${f.limitDays} أيام): المصدر لا يردّ أو تغيّر`,
                    ` — older than the limit (${f.limitDays} days): the source is not answering or has changed`,
                  )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <form action={runPricesNow} className="mb-8">
        <button className={button}>{t("حدّث الأسعار الآن", "Update prices now")}</button>
        <span className="ms-3 text-xs text-muted">
          {t("وتعمل وحدها كلّ يوم دون أن تضغط.", "It also runs by itself every day without a press.")}
        </span>
      </form>

      <section className="mb-8">
        <h2 className="title-bar mb-3 font-black">
          {t("ينتظر قرارك", "Waiting for you")} <span className="text-muted">({held.length})</span>
        </h2>
        {held.length === 0 ? (
          <p className="text-sm text-muted">{t("لا شيء محجوز.", "Nothing held.")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {held.map((q) => (
              <li key={q.id} className={card}>
                <p className="font-black">
                  {label(q)} · <span className="text-primary">{figure(q)}</span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t("يوم السوق: ", "Market day: ")}
                  {q.market_date}
                  {q.reason && (
                    <>
                      {" · "}
                      <span className="font-bold text-accent">{q.reason}</span>
                    </>
                  )}
                </p>
                {q.quote && (
                  <blockquote className="mt-2 rounded-xl bg-background px-3 py-2 text-sm [overflow-wrap:anywhere]" lang="ar" dir="rtl">
                    «{q.quote}»
                  </blockquote>
                )}
                <a href={q.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-bold text-primary underline">
                  {t("المصدر", "Source")}
                </a>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={reviewQuote}>
                    <input type="hidden" name="quote_id" value={q.id} />
                    <input type="hidden" name="publish" value="true" />
                    <button className={button}>{t("انشره", "Publish")}</button>
                  </form>
                  <form action={reviewQuote}>
                    <input type="hidden" name="quote_id" value={q.id} />
                    <input type="hidden" name="publish" value="false" />
                    <button className={ghost}>{t("ارفضه", "Reject")}</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="title-bar mb-3 font-black">{t("آخر ما نُشر", "Recently published")}</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">{t("لم يُنشر شيءٌ بعد.", "Nothing published yet.")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {recent.map((q) => (
              <li key={q.id}>
                <span className="font-bold">{label(q)}</span> · {figure(q)} · <span className="text-muted">{q.market_date}</span>{" "}
                <a href={q.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                  {t("المصدر", "Source")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="title-bar mb-3 font-black">{t("آخر التشغيلات", "Recent runs")}</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">{t("لم يعمل بعد.", "It has not run yet.")}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="rounded-xl bg-background px-3 py-2">
                <span className="font-bold">{when(r.started_at)}</span>{" "}
                <span className="text-muted">· {r.trigger === "cron" ? t("تلقائيّ", "automatic") : t("بضغطة", "by hand")}</span>
                <span className="block text-xs">
                  {t(
                    `وجد ${r.found} · نشر ${r.published} · حجز ${r.held}`,
                    `found ${r.found} · published ${r.published} · held ${r.held}`,
                  )}
                  {!r.finished_at && t(" · لم يكتمل", " · did not finish")}
                </span>
                {r.errors.length > 0 && (
                  <span className="block text-xs text-muted" dir="ltr">
                    {r.errors.join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-muted">
        <Link href="/rates" className="text-primary underline">
          {t("أسعار العملات", "Exchange rates")}
        </Link>
        {" · "}
        <Link href="/market" className="text-primary underline">
          {t("سوق المحاصيل", "Crop market")}
        </Link>
      </p>
    </div>
  );
}
