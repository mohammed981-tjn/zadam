import Link from "next/link";
import ActionNotice from "@/components/ActionNotice";
import PageHeader from "@/components/PageHeader";
import MarketTabs from "@/components/market/MarketTabs";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { money } from "@/lib/marketCrops";
import { isNotYetCreated } from "@/lib/marketOffers";
import { stateName } from "@/lib/nafir";
import { createClient } from "@/lib/supabase/server";
import {
  AVAILABILITY_LABEL,
  ITEM_LABEL,
  KIND_LABEL,
  availabilityVerdict,
  daysBetween,
  groupByItem,
  khartoumToday,
  label,
  perUnit,
  readPublishedInputs,
  type Availability,
  type SummaryRow,
} from "@/lib/inputBoard";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "أين السماد والجازولين هذا الأسبوع وبكم | سوداقري", "Where fertiliser and diesel are this week, and at what price | Sudagri"),
    description: tr(
      locale,
      "أسعار اليوريا والداب والجازولين والبنزين وتوفّرها في ولايات السودان: بلاغات المزارعين والتجّار في آخر أسبوعين، والموردون الموثّقون، وآخر ما نشرته المصادر، كلّ رقمٍ بتاريخه.",
      "Urea, DAP, diesel and petrol prices and availability across Sudan's states: farmers' and traders' reports from the last two weeks, verified suppliers, and the latest published figures, each with its date.",
    ),
  };
}

/** Reports counted on the board: the last two weeks, as the database allows them to be dated. */
const WINDOW_DAYS = 14;

/** A published figure older than this is marked as old; a report window is two weeks, a source two months. */
const PUBLISHED_OLD_DAYS = 60;

/**
 * «أين السماد والجازولين هذا الأسبوع وبكم» (البند ١٢٠).
 *
 * The page renders the same for everyone — no per-user buttons — so the
 * service worker can keep it for the field (public/sw.js). Reporting and
 * withdrawing are on /market/inputs/report.
 */
export default async function InputsBoardPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const locale = await getLocale();
  const en = locale === "en";
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const today = khartoumToday();
  const supabase = await createClient();

  const [summary, recent, suppliers] = await Promise.all([
    supabase.rpc("input_price_summary", { p_days: WINDOW_DAYS }),
    supabase.rpc("input_price_reports_recent", { p_days: WINDOW_DAYS }),
    supabase
      .from("supplier_products")
      .select("input_key, supplier_id")
      .eq("active", true)
      .eq("category", "fertilizer")
      .in("input_key", ["urea", "DAP", "NPK"]),
  ]);
  const pending = isNotYetCreated(summary.error);
  const rows = ((summary.data ?? []) as SummaryRow[]).map((r) => ({
    ...r,
    low: r.low === null ? null : Number(r.low),
    high: r.high === null ? null : Number(r.high),
    median: r.median === null ? null : Number(r.median),
  }));
  const reports = (recent.data ?? []) as {
    id: string;
    item: SummaryRow["item"];
    unit: SummaryRow["unit"];
    price_kind: "official" | "parallel" | null;
    state: string;
    locality: string;
    price_sdg: number | null;
    availability: Availability;
    observed_on: string;
    note: string | null;
  }[];
  const supplierCount = (key: string) =>
    new Set((suppliers.data ?? []).filter((p) => p.input_key === key).map((p) => p.supplier_id)).size;
  const published = readPublishedInputs();

  const day = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(en ? "en-GB" : "ar-SD-u-nu-latn", { day: "numeric", month: "long", year: "numeric" });
  const monthName = (ym: string) =>
    new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(en ? "en-GB" : "ar-SD-u-nu-latn", { month: "long", year: "numeric" });
  const ago = (d: string) => {
    const n = daysBetween(d, today);
    return n <= 0 ? t("اليوم", "today") : n === 1 ? t("أمس", "yesterday") : t(`منذ ${n} أيّام`, `${n} days ago`);
  };
  const sdg = (v: number) => (
    <span dir="ltr">
      {money(v)} <span className="text-xs font-bold">{t("جنيه", "SDG")}</span>
    </span>
  );
  const verdictClass: Record<Availability, string> = {
    available: "bg-primary/10 text-primary",
    limited: "bg-accent/20",
    unavailable: "bg-danger/10 text-danger",
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:max-w-6xl xl:max-w-7xl">
      <MarketTabs active="/market/inputs" locale={locale} />
      <PageHeader icon="chart" eyebrow={t("السوق والأسعار", "Market and prices")} title={t("أين السماد والجازولين هذا الأسبوع وبكم", "Where fertiliser and diesel are this week, and at what price")}>
        {t(
          "لا جهةَ تنشر سعرَ اليوريا أو الجازولين في السودان كلَّ أسبوع. لذلك يأتي سعرُ هذا الأسبوع من الناس: مزارعٌ أو تاجرٌ يقول بكم اشترى وأين ومتى، أو أنّه لم يجده. وتحته الموردون الموثّقون، ثمّ آخر ما نشرته المصادر بتاريخه.",
          "No one publishes the price of urea or diesel in Sudan every week. So this week's price comes from people: a farmer or trader says what he paid, where and when, or that he could not find it. Below that are the verified suppliers, then the latest published figures with their dates.",
        )}
      </PageHeader>

      <ActionNotice ok={ok} />

      <div className="mb-8 flex flex-wrap gap-2 text-sm">
        <Link href="/market/inputs/report" className="rounded-full border border-primary bg-primary px-4 py-2 font-bold text-primary-foreground">
          {t("بلّغ عن سعر ←", "Report a price →")}
        </Link>
        <Link href="/suppliers?item=fertilizer" className="rounded-full border border-border px-4 py-2 transition hover:border-rose hover:text-rose">
          {t("موردو السماد", "Fertiliser suppliers")}
        </Link>
      </div>

      {/* ── ١) بلاغات الناس ── */}
      <section aria-labelledby="reports">
        <h2 id="reports" className="mb-1 text-lg font-bold">{t(`بلاغات آخر ${WINDOW_DAYS} يوماً`, `Reports from the last ${WINDOW_DAYS} days`)}</h2>
        <p className="mb-3 text-xs text-muted">
          {t(
            "من مزارعين وتجّار مسجّلين. المنصّة لم تتحقّق منها؛ لذلك نكتب عدد البلاغات وعدد من أرسلوها، والأدنى والأعلى والوسيط. لا نُظهر اسم من بلّغ.",
            "From registered farmers and traders. The platform has not checked them, so each line gives the number of reports and of people who sent them, the lowest, highest and median. Who reported is never shown.",
          )}
        </p>

        {pending ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm">{t("البلاغات تُفعَّل قريباً.", "Reports open soon.")}</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed">
            <p className="font-bold">{t("لا بلاغ بعد في آخر أسبوعين.", "No reports in the last two weeks yet.")}</p>
            <p className="mt-1 text-muted">
              {t(
                "كن الأوّل: إن اشتريت يوريا أو جازولين هذا الأسبوع، أو بحثت ولم تجد، فبلاغك يفيد كلّ من في ولايتك.",
                "Be the first: if you bought urea or diesel this week, or looked and could not find it, your report helps everyone in your state.",
              )}{" "}
              <Link href="/market/inputs/report" className="font-bold text-primary underline">{t("بلّغ الآن", "Report now")}</Link>
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            {groupByItem(rows).map(([item, list]) => (
              <div key={item} className="rounded-2xl border border-border bg-card p-4">
                <h3 className="mb-2 font-bold">{label(ITEM_LABEL, item, locale)}</h3>
                <ul className="flex flex-col gap-3">
                  {list.map((r) => {
                    const verdict = availabilityVerdict(r);
                    return (
                      <li key={`${r.unit}|${r.price_kind}|${r.state}`} className="border-t border-border pt-3 text-sm first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold">
                            {stateName(r.state, locale)}
                            {r.price_kind && <span className="font-normal text-muted"> · {label(KIND_LABEL, r.price_kind, locale)}</span>}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${verdictClass[verdict]}`}>{label(AVAILABILITY_LABEL, verdict, locale)}</span>
                        </div>
                        {r.median !== null && r.priced > 0 ? (
                          <div className="mt-1">
                            <span className="text-xl font-black">{sdg(r.median)}</span>{" "}
                            <span className="text-xs text-muted">
                              {perUnit(r.unit, locale)}
                              {r.priced > 1 && r.low !== null && r.high !== null && (
                                <>
                                  {" · "}
                                  {t("الوسيط؛ من", "median; from")} <span dir="ltr">{money(r.low)}</span> {t("إلى", "to")} <span dir="ltr">{money(r.high)}</span>
                                </>
                              )}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-muted">{t("لا سعر: كلّ البلاغات تقول إنّه غير موجود.", "No price: every report says it could not be found.")}</div>
                        )}
                        <div className="mt-1 text-xs text-muted">
                          {t(`${r.reports} بلاغ من ${r.reporters} شخص`, `${r.reports} report(s) from ${r.reporters} person(s)`)}
                          {r.unavailable > 0 && t(` · ${r.unavailable} قال «غير موجود»`, ` · ${r.unavailable} said «not to be found»`)}
                          {" · "}
                          {t("آخرها", "latest")} {ago(r.latest_on)}
                          {r.reporters === 1 && t(" · بلاغُ شخصٍ واحد: خذه بحذر", " · one person's report: take it with care")}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {reports.length > 0 && (
              <details className="rounded-2xl border border-border bg-card p-4 text-sm">
                <summary className="cursor-pointer font-bold">{t(`كلّ البلاغات (${reports.length})`, `All reports (${reports.length})`)}</summary>
                <ul className="mt-3 flex flex-col gap-2">
                  {reports.map((r) => (
                    <li key={r.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                      <span className="font-bold">{label(ITEM_LABEL, r.item, locale)}</span> — {stateName(r.state, locale)}، {r.locality}
                      {r.price_kind && <span className="text-muted"> · {label(KIND_LABEL, r.price_kind, locale)}</span>}
                      <br />
                      {r.price_sdg !== null ? (
                        <>
                          {sdg(Number(r.price_sdg))} {perUnit(r.unit, locale)}
                          {r.availability === "limited" && <span className="text-muted"> · {label(AVAILABILITY_LABEL, "limited", locale)}</span>}
                        </>
                      ) : (
                        <span className="font-bold text-danger">{label(AVAILABILITY_LABEL, "unavailable", locale)}</span>
                      )}
                      <span className="text-xs text-muted"> · {day(r.observed_on)}</span>
                      {r.note && <p className="mt-0.5 text-xs text-muted">«{r.note}»</p>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      {/* ── ٢) الموردون ── */}
      <section aria-labelledby="suppliers" className="mt-10">
        <h2 id="suppliers" className="mb-1 text-lg font-bold">{t("موردو السماد الموثّقون في سوداقري", "Verified fertiliser suppliers on Sudagri")}</h2>
        <ul className="mb-2 flex flex-wrap gap-2 text-sm">
          {(["urea", "DAP", "NPK"] as const).map((k) => (
            <li key={k}>
              <Link href={`/suppliers?item=${k}`} className="inline-block rounded-full border border-border px-3 py-1.5">
                {label(ITEM_LABEL, k === "urea" ? "urea" : k === "DAP" ? "dap" : "npk", locale)}:{" "}
                <span className="font-bold">{t(`${supplierCount(k)} مورّد`, `${supplierCount(k)} supplier(s)`)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          {t(
            "الموردون يعرضون السعر بالدولار، ويوصلون إلى الولايات التي يذكرونها. ",
            "Suppliers list their price in dollars, and deliver to the states they name. ",
          )}
          <Link href="/suppliers/mine" className="text-primary underline">{t("هل تبيع السماد؟ سجّل متجرك", "Do you sell fertiliser? Register your shop")}</Link>
        </p>
      </section>

      {/* ── ٣) ما نشرته المصادر ── */}
      <section aria-labelledby="published" className="mt-10">
        <h2 id="published" className="mb-1 text-lg font-bold">{t("آخر ما نشرته المصادر", "The latest published figures")}</h2>
        <p className="mb-3 text-xs text-muted">
          {t(
            "منسوخةٌ باليد من مصدرها، كلّ رقمٍ بتاريخ نشره. هي أقدم من البلاغات، فاجعلها مرجعاً لا سعرَ اليوم.",
            "Copied by hand from their sources, each figure with the date it was published. They are older than the reports: use them as a reference, not as today's price.",
          )}
        </p>
        {!published ? (
          <p className="text-sm text-muted">{t("تعذّرت قراءة ملفّ المصادر.", "The sources file could not be read.")}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {published.figures.map((f, i) => {
                const old = daysBetween(f.date, today) > PUBLISHED_OLD_DAYS;
                return (
                  <li key={i} className="rounded-2xl border border-border bg-card p-4 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-bold">
                        {label(ITEM_LABEL, f.item, locale)} — {en ? f.place_en : f.place_ar}
                      </span>
                      <span>
                        <span className="text-lg font-black">{sdg(f.price)}</span>{" "}
                        <span className="text-xs text-muted">{perUnit(f.unit, locale)}</span>
                      </span>
                    </div>
                    {(en ? f.note_en : f.note_ar) && <p className="mt-1 text-xs text-muted">{en ? f.note_en : f.note_ar}</p>}
                    <p className={`mt-1 text-xs ${old ? "font-bold text-danger" : "text-muted"}`}>
                      {t("نُشر في", "Published")} {day(f.date)}
                      {old && t(" — قديم، فتحقّق قبل أن تشتري عليه", " — old, check before you buy on it")}
                      {" · "}
                      <a href={f.url} className="underline" target="_blank" rel="noopener noreferrer">{en ? f.source_en : f.source_ar}</a>
                    </p>
                  </li>
                );
              })}
            </ul>

            {published.trends.length > 0 && (
              <div className="mt-4 flex flex-col gap-3">
                <h3 className="font-bold">{t("الاتّجاه الشهريّ", "The monthly trend")}</h3>
                {published.trends.map((tr_, i) => (
                  <div key={i} className="rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed">
                    <p>{en ? tr_.en : tr_.ar}</p>
                    <p className="mt-1 text-xs text-muted">
                      {monthName(tr_.month)} · <a href={tr_.url} className="underline" target="_blank" rel="noopener noreferrer">{en ? tr_.source_en : tr_.source_ar}</a>
                    </p>
                  </div>
                ))}
                {published.trends.length > 1 && (
                  <p className="text-xs text-muted">
                    {t(
                      "المصدران يختلفان في اتّجاه وقود السوق الموازي في أغسطس: برنامج الأغذية يقول انخفض عن يوليو، والمعهد يقول واصل الارتفاع. بلاغاتُ الناس أعلاه أقربُ إلى سعر هذا الأسبوع من الاثنين.",
                      "The two sources disagree on the direction of parallel-market fuel in August: WFP says it fell from July, IFPRI that it kept rising. People's reports above are closer to this week's price than either.",
                    )}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <p className="mt-10 rounded-2xl border border-border bg-card p-4 text-xs leading-relaxed text-muted">
        {t(
          "لماذا لا نقرأ هذا من FEWS NET كما نقرأ أسعار الذرة؟ لأنّه لا سلسلةَ عنده للسماد في السودان، وسلاسل الجازولين عنده بلا قيمةٍ منذ ٢٠٢٤ («لم يُجمع»). تحقّقنا من ذلك في ٢١ أكتوبر ٢٠٢٦.",
          "Why not read this from FEWS NET, as the sorghum prices are? Because it has no fertiliser series for Sudan, and its diesel series carry no value since 2024 («Not Collected»). We checked on 21 October 2026.",
        )}
      </p>
    </div>
  );
}
